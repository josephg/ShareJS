var Doc;
if (typeof require !== 'undefined') {
  Doc = require('./doc').Doc;
}

// Queries are live requests to the database for particular sets of fields.
//
// The server actively tells the client when there's new data that matches
// a set of conditions.
var Query = exports.Query = function(type, connection, id, collection, query, options, callback) {
  // 'fetch' or 'sub'
  this.type = type;

  this.connection = connection;
  this.id = id;
  this.collection = collection;

  // The query itself. For mongo, this should look something like {"data.x":5}
  this.query = query;

  // Do we ask the server to give us snapshots of the documents with the query
  // results?
  this.autoFetch = options.autoFetch || false;

  // Do we repoll the entire query whenever anything changes? (As opposed to
  // just polling the changed item). This needs to be enabled to be able to use
  // ordered queries (sortby:) and paginated queries. Set to undefined, it will
  // be enabled / disabled automatically based on the query's properties.
  this.poll = options.poll;

  // The backend we actually hit. If this isn't defined, it hits the snapshot
  // database. Otherwise this can be used to hit another configured query
  // index.
  this.source = options.source;

  // A list of resulting documents. These are actual documents, complete with
  // data and all the rest. If autoFetch is false, these documents will not
  // have any data. You should manually call fetch() or subscribe() on them.
  //
  // Calling subscribe() might be a good idea anyway, as you won't be
  // subscribed to the documents by default.
  this.results = [];

  // Do we have some initial data?
  this.ready = false;

  this.callback = callback;

  this._sendSubFetch(this);
};
Query.prototype.action = 'qsub';

// Helper for subscribe & fetch, since they share the same message format.
Query.prototype._sendSubFetch = function() {
  if (this.connection.canSend) {
    var msg = {
      a: 'q' + this.type,
      id: this.id,
      c: this.collection,
      o: {f:this.autoFetch, b:this.source},
      q: this.query
    };

    if (this.poll !== undefined) msg.o.p = this.poll;

    this.connection.send(msg);
  }
};

// Make a list of documents from the list of server-returned data objects
Query.prototype._dataToDocs = function(data) {
  var results = [];
  for (var i = 0; i < data.length; i++) {
    var docData = data[i];
    results.push(this.connection.getOrCreate(docData.c || this.collection, docData.docName, docData));
  }
  return results;
};

// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  if (this.connection.canSend && this.type === 'sub') {
    this.connection.send({a:'qunsub', id:this.id});
  }

  this.connection.destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting') {
    this._sendSubFetch();
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if ((msg.a === 'qfetch') !== (this.type === 'fetch')) {
    if (console) console.warn('Invalid message sent to query', msg, this);
    return;
  }

  if (msg.error) this.emit('error', msg.error);

  switch (msg.a) {
    case 'qfetch':
      var results = msg.data ? this._dataToDocs(msg.data) : undefined;
      if (this.callback) this.callback(msg.error, results, msg.extra);
      // Once a fetch query gets its data, it is destroyed.
      this.connection.destroyQuery(this);
      break;

    case 'q':
      // Query diff data (inserts and removes)
      if (msg.diff) {
        for (var i = 0; i < msg.diff.length; i++) {
          var d = msg.diff[i];
          switch (d.type) {
            case 'insert':
              var newDocs = this._dataToDocs(d.values);
              Array.prototype.splice.apply(this.results, [d.index, 0].concat(newDocs));
              this.emit('insert', newDocs, d.index);
              break;
            case 'remove':
              var howMany = d.howMany || 1;
              var removed = this.results.splice(d.index, howMany);
              this.emit('remove', removed, d.index);
              break;
            case 'move':
              var howMany = d.howMany || 1;
              var docs = this.results.splice(d.from, howMany);
              Array.prototype.splice.apply(this.results, [d.to, 0].concat(docs));
              this.emit('move', docs, d.from, d.to);
              break;
          }
        }
      }

      if (msg.extra) {
        this.emit('extra', msg.extra);
      }
      break;
    case 'qsub':
      // This message replaces the entire result set with the set passed.
      if (!msg.error) {
        var previous = this.results;

        // Then add everything in the new result set.
        this.results = this._dataToDocs(msg.data);
        this.extra = msg.extra;

        this.ready = true;
        this.emit('change', this.results, previous);
      }
      if (this.callback) {
        this.callback(msg.error, this.results, this.extra);
        delete this.callback;
      }
      break;
  }
};

// Change the thing we're searching for. This isn't fully supported on the
// backend (it destroys the old query and makes a new one) - but its
// programatically useful and I might add backend support at some point.
Query.prototype.setQuery = function(q) {
  if (this.type !== 'sub') throw new Error('cannot change a fetch query');

  this.query = q;
  if (this.connection.canSend) {
    // There's no 'change' message to send to the server. Just resubscribe.
    this.connection.send({a:'qunsub', id:this.id});
    this._sendSubFetch();
  }
};

var MicroEvent;
if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Query);

