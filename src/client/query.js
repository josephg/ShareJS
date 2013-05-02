// Queries are live requests to the database for particular sets of fields.
//
// The server actively tells the client when there's new data that matches
// a set of conditions.
var Query = exports.Query = function(connection, id, collection, query) {
  this.connection = connection;

  this.id = id;
  this.collection = collection;

  // The query itself. For mongo, this should look something like {"data.x":5}
  this.query = query;

  // A list of resulting documents. These are actual documents, complete with
  // data and all the rest. If autoFetch is false, these documents will not
  // have any data. You should manually call fetch() or subscribe() on them.
  //
  // Calling subscribe() might be a good idea anyway, as you won't be
  // subscribed to the documents by default.
  this.results = [];
  
  // Do we ask the server to give us snapshots of the documents with the query
  // results?
  this.autoFetch = false;

  // Do we repoll the entire query whenever anything changes? (As opposed to
  // just polling the changed item). This needs to be enabled to be able to use
  // ordered queries (sortby:) and paginated queries. Set to undefined, it will
  // be enabled / disabled automatically based on the query's properties.
  this.poll = undefined;

  // Should we automatically resubscribe on reconnect? This is set when you
  // subscribe and unsubscribe.
  this.autoSubscribe = false;

  // Do we have some initial data?
  this.ready = false;
}

// Like the equivalent in the Doc class, this calls the specified function once
// the query has data.
Query.prototype.whenReady = function(fn) {
  if (this.ready) {
    fn();
  } else {
    this.once('ready', fn);
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if (msg.error) return this.emit('error', msg.error);

  if (msg.data) {
    // This message replaces the entire result set with the set passed.
    var previous = this.results.slice();

    // Remove all current results.
    this.results.length = 0;

    // Then add everything in the new result set.
    for (var i = 0; i < msg.data.length; i++) {
      var docData = msg.data[i];
      var doc = this.connection.getOrCreate(this.collection, docData.docName, docData);
      this.results.push(doc);
    }

    if (!this.ready) {
      this.ready = true;
      this.emit('ready', this.results);
    } else {
      this.emit('change', this.results, previous);
    }

  } else if (msg.add) {
    // Just splice in one element to the list.
    var data = msg.add;
    var doc = this.connection.getOrCreate(this.collection, data.docName, data);
    this.results.splice(msg.idx, 0, doc);
    this.emit('insert', doc, msg.idx);

  } else if (msg.rm) {
    // Remove one.
    var removed = this.results.splice(msg.idx, 1);
    this.emit('remove', removed[0], msg.idx);
  }

  if (msg.a === 'qfetch') {
    if (this.fetchCallback) this.fetchCallback(null, this.results);
    delete this.fetchCallback;
  }
};

// Helper for subscribe & fetch, since they share the same message format.
Query.prototype._subFetch = function(action) {
  var msg = {
    a: action,
    id: this.id,
    c: this.collection,
    o: {f:this.autoFetch},
    q: this.query
  };

  if (this.poll !== undefined) msg.o.p = this.poll;

  this.connection.send(msg);
};

// Fetch the query results but do not subscribe to them.
Query.prototype.fetch = function(callback) {
  if (!this.connection.canSend) {
    callback('Not connected');
  } else if (this.fetchCallback !== undefined) {
    callback('Already fetching');
  } else {
    this.fetchCallback = callback || null;
    this._subFetch('qfetch');
  }
};

// Subscribe to the query. This means we get the query data + updates. Do not
// call subscribe multiple times. Once subscribe is called, the query will
// automatically be resubscribed after the client reconnects.
Query.prototype.subscribe = function() {
  this.autoSubscribe = true;
  if (this.connection.canSend) {
    this._subFetch('qsub');
  }
}

// Unsubscribe from the query.
Query.prototype.unsubscribe = function() {
  this.autoSubscribe = false;

  if (this.connection.canSend)
    this.connection.send({a:'qunsub', id:this.id});
};

// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  this.connection.destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting' && this.autoSubscribe)
    this._subFetch('qsub');
};

var MicroEvent;
if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Query);

