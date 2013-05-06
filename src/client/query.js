var Doc;
if (typeof require !== 'undefined') {
  Doc = require('./doc').Doc;
}

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
  // subscribe and unsubscribe. false, 'fetch' or true.
  this.wantSubscribe = false;

  // Are we subscribed on the server?
  this.subscribed = false;
   
  // Have we requested a subscribe? false, 'fetch' or true.
  this._subscribeRequested = false;
  this._subscribeCallbacks = [];

  // Do we have some initial data?
  this.ready = false;
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

Query.prototype.flush = function() {
  if (this.wantSubscribe !== this._subscribeRequested
      && this.connection.canSend) {

    if (this.wantSubscribe) {
      this._subFetch(this.wantSubscribe === 'fetch' ? 'qfetch' : 'qsub');
    } else {
      // Unsubscribe.
      this.connection.send({a:'qunsub', id:this.id});
    }

    this._subscribeRequested = this.wantSubscribe;
  }
};

// Just copy the code in from the document class. Its fine.
Query.prototype._setWantSubscribe = Doc.prototype._setWantSubscribe;

Query.prototype.fetch = Doc.prototype.fetch;
Query.prototype.subscribe = Doc.prototype.subscribe;
Query.prototype.unsubscribe = Doc.prototype.unsubscribe;

// Called when our subscribe, fetch or unsubscribe messages are acknowledged.
Doc.prototype._finishSub = function(action, error) {
  this.subscribed = action === true;

  for (var i = 0; i < this._subscribeCallbacks.length; i++) {
    this._subscribeCallbacks[i](error);
  }
  this._subscribeCallbacks.length = 0;
};


// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  this.connection.destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting' && this.wantSubscribe) {
    this._subFetch('qsub');
  } else if (this.connection.state === 'disconnected') {
    this.subscribed = this._subscribeRequested = false;
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if (msg.error) this.emit('error', msg.error);

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

    this.ready = true;
    this.emit('change', this.results, previous);
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
    this._finishSubscribe('fetch', msg.error);
  } else if (msg.a === 'qsub') {
    this._finishSubscribe(true, msg.error);
  } else if (msg.a === 'qunsub') {
    this._finishSubscribe(false, msg.error);
  }
};

var MicroEvent;
if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Query);

