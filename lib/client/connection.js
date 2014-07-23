var Doc = require('./doc.js');
var Query = require('./query.js');
var EventEmitter = require('events').EventEmitter;

module.exports = Connection;

/**
 * Handles communication with the sharejs server and provides queries and
 * documents.
 *
 * We create a connection with a socket object
 *   connection = new sharejs.Connection(sockset)
 * The socket may be any object handling the websocket protocol. See the
 * documentation of bindToSocket() for details. We then wait for the connection
 * to connect
 *   connection.on('connected', ...)
 * and are finally able to work with shared documents
 *   connection.get('food', 'steak') // Doc 
 *
 * @param socket @see bindToSocket
 */
function Connection(socket) {
  EventEmitter.call(this);

  // Map of collection -> docName -> doc object for created documents.
  // (created documents MUST BE UNIQUE)
  this.collections = {};

  // Each query is created with an id that the server uses when it sends us
  // info about the query (updates, etc).
  //this.nextQueryId = (Math.random() * 1000) |0;
  this.nextQueryId = 1;

  // Map from query ID -> query object.
  this.queries = {};

  // This is a helper variable the document uses to see whether we're currently
  // in a 'live' state. It is true if we're connected, or if you're using
  // browserchannel and connecting.
  this.canSend = false

  this.debug = true;

  // I'll store the most recent 100 messages so when errors occur we can see
  // what happened.
  this.messageBuffer = [];

  this.outgoingDocSubscriptions = [];
  this.outgoingOps = [];

  // State of the connection. The correspoding events are emmited when this
  // changes. These states are different from the socket's state.
  //
  // Available states are:
  // - 'connecting'   The connection has been established, but we don't have our
  //                  client ID yet.
  // - 'connected'    We have connected and recieved our client ID. Ready for data.
  // - 'disconnected' The connection is closed, and we're waiting for it to reconnect.
  this._setState('disconnected');

  this.bindToSocket(socket);
}

(function() {
  for (var k in EventEmitter.prototype) {
    Connection.prototype[k] = EventEmitter.prototype[k];
  }
})();

/**
 * Use socket to communicate with server
 *
 * Socket is an object that can handle the websocket protocol. This method
 * installs the onopen, onclose, onmessage and onerror handlers on the socket to
 * handle communication and sends messages by calling socket.send(msg). The
 * sockets `readyState` property is used to determine the initaial state.
 *
 * @param socket Handles the websocket protocol
 * @param socket.readyState
 * @param socket.close
 * @param socket.send
 * @param socket.onopen
 * @param socket.onclose
 * @param socket.onmessage
 * @param socket.onerror
 */
Connection.prototype.bindToSocket = function(socket) {
  if (this.socket) {
    delete this.socket.onopen
    delete this.socket.onclose
    delete this.socket.onmessage
    delete this.socket.onerror
  }

  this.socket = socket;
  // This logic is replicated in setState - consider calling setState here
  // instead.
  // this.state = (socket.readyState === 0 || socket.readyState === 1) ? 'connecting' : 'disconnected';
  // this.canSend = this.state === 'connecting' && socket.canSendWhileConnecting;

  if ((socket.readyState === 0 && socket.canSendWhileConnecting)
    || socket.readyState === 1) {
    this._setState('connecting');
  }

  var connection = this

  socket.onmessage = function(msg) {
    var data = msg.data;

    // Fall back to supporting old browserchannel 1.x API which implemented the
    // websocket API incorrectly. This will be removed at some point
    if (!data) data = msg;
    
    // Some transports don't need parsing.
    if (typeof data === 'string') data = JSON.parse(data);

    if (connection.debug) console.log('RECV', JSON.stringify(data));

    connection.messageBuffer.push({
      t: (new Date()).toTimeString(),
      recv:JSON.stringify(data)
    });
    while (connection.messageBuffer.length > 100) {
      connection.messageBuffer.shift();
    }

    try {
      connection.handleMessage(data);
    } catch (e) {
      connection.emit('error', e);
      // We could also restart the connection here, although that might result
      // in infinite reconnection bugs.
      throw e;
    }
  }

  socket.onopen = function() {
    connection.emit('socket open');
    connection._setState('connecting');
  };

  if (!socket.onerror) socket.onerror = function(e) {
    // This isn't the same as a regular error, because it will happen normally
    // from time to time. Your connection should probably automatically
    // reconnect anyway, but that should be triggered off onclose not onerror.
    // (onclose happens when onerror gets called anyway).
    connection.emit('socket error', e);
  };

  socket.onclose = function(reason) {
    connection.emit('socket close');
    connection._setState('disconnected', reason);
  };
};


/**
 * @param {object} msg
 * @param {String} msg.a action
 */
Connection.prototype.handleMessage = function(msg) {
  // Switch on the message action. Most messages are for documents and are
  // handled in the doc class.
  switch (msg.a) {
    case 'init':
      // Client initialization packet. This bundle of joy contains our client
      // ID.
      if (msg.protocol !== 0) throw new Error('Invalid protocol version');
      if (typeof msg.id != 'string') throw new Error('Invalid client id');

      this.id = msg.id;
      this._setState('connected');
      break;

    case 'qfetch':
    case 'qsub':
    case 'q':
    case 'qunsub':
      // Query message. Pass this to the appropriate query object.
      var query = this.queries[msg.id];
      if (query) query._onMessage(msg);
      break;

    case 'bs':
      // Bulk subscribe response. The responses for each document are contained within.
      var result = msg.s;
      for (var cName in result) {
        for (var docName in result[cName]) {
          var doc = this.get(cName, docName);
          if (!doc) {
            if (console) console.error('Message for unknown doc. Ignoring.', msg);
            break;
          }

          var msg = result[cName][docName];
          if (typeof msg === 'object') {
            doc._handleSubscribe(msg.error, msg);
          } else {
            // The msg will be true if we simply resubscribed.
            doc._handleSubscribe(null, null);
          }
        }
      }
      break;

    default:
      // Document message. Pull out the referenced document and forward the
      // message.
      var collection, docName, doc;
      if (msg.d) {
        collection = this._lastReceivedCollection = msg.c;
        docName = this._lastReceivedDoc = msg.d;
      } else {
        collection = msg.c = this._lastReceivedCollection;
        docName = msg.d = this._lastReceivedDoc;
      }

      this.get(collection, docName)._onMessage(msg);
  }
};


// Call f on all documents.
Connection.prototype.forEachDoc = function(f) {
  for (var c in this.collections) {
    var collection = this.collections[c];
    for (var docName in collection) {
      f.call(this, collection[docName], c, docName);
    }
  }
}

// Set the connection's state. The connection is basically a state machine.
Connection.prototype._setState = function(newState, data) {
  if (this.state === newState) return;

  // I made a state diagram. The only invalid transitions are getting to
  // 'connecting' from anywhere other than 'disconnected' and getting to
  // 'connected' from anywhere other than 'connecting'.
  if ((newState === 'connecting' && this.state !== 'disconnected') ||
       (newState === 'connected' && this.state !== 'connecting')) {
    throw new Error("Cannot transition directly from " + this.state + " to " + newState);
  }

  this.state = newState;
  this.canSend = newState === 'connecting' || newState === 'connected';

  this.emit(newState, data);


  // Different behaviour based on our new state.

  switch (newState) {
    case 'connecting':
      // Resubscribe to everything with a bulkSubscribe.
      this.forEachDoc(function(doc) {
        if (doc.subscribed) this._subscribeDoc(doc);
      });

      // Its important that query resubscribes are sent after documents to make
      // sure the server knows all the documents we're subscribed to when it
      // issues the queries internally. (Is this still true?)

      // No bulk subscribe for queries yet.
      for (var id in this.queries) {
        this.queries[id]._execute();
      }
      break;

    case 'connected':
      // Send all outstanding operations.
      this.forEachDoc(function(doc) {
        if (doc.inflightData) doc._sendOpData();
      });
      break;

    case 'disconnected':
      this.id =
        this._lastReceivedCollection = this._lastReceivedDoc =
        this._lastSentCollection = this._lastSentDoc = null;

      this.seq = 1;
      break;
  }
};

// Flush all buffered data to the connection. This should be called
// automatically.
Connection.prototype.flush = function() {
  // **** Subscription data.
  var docs = this.outgoingDocSubscriptions;

  // Either there's only one document to subscribe, or there's
  // many. In reality, we could use the latter code for all subscriptions -
  // which might simplify things on the server.
  if (docs.length === 1) {
    // Regular subscribe message.
    var doc = docs[0];
    var msg = {a:'sub', c:doc.collection, d:doc.name};
    if (doc.v != null) msg.v = v;
    this.send(msg);
  } else if (docs.length > 1) {
    // Bulk subscribe all docs
    var subData = {};
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var collection = doc.collection;
      if (!subData[collection]) data[collection] = {};
      data[collection][doc.name] = v || null;
    }
    this.send({a:'bs', s:subData});
  }
  docs.length = 0;

  // **** Operations.

  // The ops are currently sent one at a time - it would be much better if they
  // were sent in bulk (we could do lightweight transactions like that), but
  // thats not implemented.
  var ops = this.outgoingOps;

  // Its important that operations are resent in the same order that they were
  // originally sent. If we don't sort, an op with a high sequence number will
  // convince the server not to accept any ops with earlier sequence numbers.
  ops.sort(function(a, b) { return a.seq - b.seq; });
  for (var i = 0; i < ops.length; i++) {
    var d = ops[i];

    var msg = {a:'op', v:this.version};
    if (d.src) {
      msg.src = d.src;
      msg.seq = d.seq;
    } else {
      // The first time we send an op, its id and sequence number are implied by
      // the connection. (This is a microoptimization for the 99% case)
      d.src = this.id;
      d.seq = this.seq++;
    }

    if (d.op) msg.op = d.op;
    if (d.create) msg.create = d.create;
    if (d.del) msg.del = d.del;

    msg.c = d.collection;
    msg.d = d.name;

    this.send(msg);
  }
  ops.length = 0;
};

Connection.prototype.flushSoon = function() {
  var self = this;
  setTimeout(function() { self.flush(); }, 0);
}

// This is called by the document class when the document wants to subscribe. We
// could just send a subscribe message immediately, but during reconnect that
// causes a bajillion messages. Instead, its much more efficient to aggregate
// all subscribe() calls which happen within an event loop into one message.
Connection.prototype._subscribeDoc = function(doc) {
  if (this.outgoingDocSubscriptions.push(doc) === 1) this.flushSoon();
};

// So, there's an awful error case where the client sends two requests (which
// fail), then reconnects. The documents could have _onConnectionStateChanged
// called in the wrong order and the operations then get sent with reversed
// sequence numbers. This causes the server to incorrectly reject the second
// sent op. So we need to queue the operations while we're reconnecting and
// resend them in the correct order.
Connection.prototype.sendOp = function(data) {
  if (this.outgoingOps.push(data) === 1) this.flushSoon();
};

/**
 * Sends a message down the socket
 */
Connection.prototype.send = function(msg) {
  if (this.debug) console.log("SEND", JSON.stringify(msg));
  this.messageBuffer.push({t:Date.now(), send:JSON.stringify(msg)});
  while (this.messageBuffer.length > 100) {
    this.messageBuffer.shift();
  }

  if (msg.d) { // The document the message refers to. Not set for queries.
    var collection = msg.c;
    var docName = msg.d;
    if (collection === this._lastSentCollection && docName === this._lastSentDoc) {
      delete msg.c;
      delete msg.d;
    } else {
      this._lastSentCollection = collection;
      this._lastSentDoc = docName;
    }
  }

  if (!this.socket.canSendJSON)
    msg = JSON.stringify(msg);
  
  this.socket.send(msg);
};

/**
 * Get or create a document.
 *
 * @param collection
 * @param name
 * @param [data] ingested into document if created
 * @return {Doc}
 */
Connection.prototype.get = function(collection, name, data) {
  var collectionObject = this.collections[collection];
  if (!collectionObject)
    collectionObject = this.collections[collection] = {};

  var doc = collectionObject[name];
  if (!doc)
    doc = collectionObject[name] = new Doc(this, collection, name);

  // Even if the document isn't new, its possible the document was created
  // manually and then tried to be re-created with data (suppose a query
  // returns with data for the document). We should hydrate the document
  // immediately if we can because the query callback will expect the document
  // to have data.
  if (data && data.data !== undefined && !doc.state)
    doc.ingestData(data);

  return doc;
};

// Call doc.destroy().
Connection.prototype._destroyDoc = function(doc) {
  var collectionObject = this.collections[doc.collection];
  if (!collectionObject) return;

  delete collectionObject[doc.name];

  // Delete the collection container if its empty. This could be a source of
  // memory leaks if you slowly make a billion collections, which you probably
  // won't do anyway, but whatever.
  if (isEmpty(collectionObject))
    delete this.collections[doc.collection];
};
 

function isEmpty(object) {
  for (var key in object) return false;
  return true;
};


// Helper for createFetchQuery and createSubscribeQuery, below.
Connection.prototype._createQuery = function(type, collection, q, options, callback) {
  if (type !== 'fetch' && type !== 'sub')
    throw new Error('Invalid query type: ' + type);

  if (!options) options = {};
  var id = this.nextQueryId++;
  var query = new Query(type, this, id, collection, q, options, callback);
  this.queries[id] = query;
  query._execute();
  return query;
};

// Internal function. Use query.destroy() to remove queries.
Connection.prototype._destroyQuery = function(query) {
  delete this.queries[query.id];
};

// The query options object can contain the following fields:
//
// docMode: What to do with documents that are in the result set. Can be
//   null/undefined (default), 'fetch' or 'subscribe'. Fetch mode indicates
//   that the server should send document snapshots to the client for all query
//   results. These will be hydrated into the document objects before the query
//   result callbacks are returned. Subscribe mode gets document snapshots and
//   automatically subscribes the client to all results. Note that the
//   documents *WILL NOT* be automatically unsubscribed when the query is
//   destroyed. (ShareJS doesn't have enough information to do that safely).
//   Beware of memory leaks when using this option.
//
// poll: Forcably enable or disable polling mode. Polling mode will reissue the query
//   every time anything in the collection changes (!!) so, its quite
//   expensive.  It is automatically enabled for paginated and sorted queries.
//   By default queries run with polling mode disabled; which will only check
//   changed documents to test if they now match the specified query.
//   Set to false to disable polling mode, or true to enable it. If you don't
//   specify a poll option, polling mode is enabled or disabled automatically
//   by the query's backend.
//
// backend: Set the backend source for the query. You can attach different
//   query backends to livedb and pick which one the query should hit using
//   this parameter.
//
// results: (experimental) Initial list of resultant documents. This is
//   useful for rehydrating queries when you're using autoFetch / autoSubscribe
//   so the server doesn't have to send over snapshots for documents the client
//   already knows about. This is experimental - the API may change in upcoming
//   versions.

// Create a fetch query. Fetch queries are only issued once, returning the
// results directly into the callback.
//
// The index is specific to the source, but if you're using mongodb it'll be
// the collection to which the query is made.
// The callback should have the signature function(error, results, extraData)
// where results is a list of Doc objects.
Connection.prototype.createFetchQuery = function(index, q, options, callback) {
  return this._createQuery('fetch', index, q, options, callback);
};

// Create a subscribe query. Subscribe queries return with the initial data
// through the callback, then update themselves whenever the query result set
// changes via their own event emitter.
//
// If present, the callback should have the signature function(error, results, extraData)
// where results is a list of Doc objects.
Connection.prototype.createSubscribeQuery = function(index, q, options, callback) {
  return this._createQuery('sub', index, q, options, callback);
};
