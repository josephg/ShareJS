// Queries are live requests to the database for particular sets of fields.
//
// The server actively tells the client when there's new data that matches
// a set of conditions.
var Query = function(connection, id, collection, query) {
  this.connection = connection;

  this.id = id;
  this.collection = collection;

  // The query itself. For mongo, this should look something like {"data.x":5}
  this.query = query;

  // A map from document name -> document object. If autoFetch is false, these
  // documents will not have any data. You should manually call fetch() or
  // subscribe() on them.
  //
  // Calling subscribe() might be a good idea anyway, as you won't be
  // subscribed to the documents by default.
  this.data = {};
  
  // Do we ask the server to give us snapshots of the documents with the query
  // results?
  this.autoFetch = false;

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
    this.on('ready', fn);
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if (msg.error) return this.emit('error', msg.error);

  if (msg.data) {
    // This message replaces the entire result set with the set passed.

    // First go through our current data set removing anything thats no longer there.
    var name;
    for (name in this.data) {
      if (!msg.data[name]) {
        this.emit('removed', this.data[name]);
        delete this.data[name];
      }
    }

    // Now go through the result set and add anything that we don't already have
    for (name in msg.data) {
      if (!this.data[name]) {
        var doc = this.data[name] = this.connection.getOrCreate(this.collection, name, msg.data[name]);
        this.emit('added', doc);
      }
    }

    if (!this.ready) {
      this.ready = true;
      this.emit('ready', this.data);
    }

  } else if (msg.add) {
    // Just add one element to the list.
    var data = msg.add;
    var doc = this.data[data.doc] = this.connection.getOrCreate(this.collection, data.doc, data);
    this.emit('added', doc);

  } else if (msg.rm) {
    // Remove one
    this.emit('removed', this.data[msg.rm]);
    return delete this.data[msg.rm];
  }
};

// Subscribe to the query. This means we get the query data + updates. Do not
// call subscribe multiple times. Once subscribe is called, the query will
// automatically be resubscribed after the client reconnects.
Query.prototype.subscribe = function() {
  this.autoSubscribe = true;

  if (this.connection.canSend) {
    this.connection.send({
      a: 'qsub',
      c: this.collection,
      f: this.autoFetch,
      id: this.id,
      q: this.query
    });
  }
};

// Unsubscribe from the query.
Query.prototype.unsubscribe = function() {
  this.autoSubscribe = false;

  if (this.connection.canSend) {
    this.connection.send({
      a: 'qunsub',
      id: this.id
    });
  }
};

// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  this.connection.destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting' && this.autoSubscribe)
    this.subscribe();
};


MicroEvent.mixin(Query);

