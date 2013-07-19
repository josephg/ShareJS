// A Connection wraps a persistant BC connection to a sharejs server.
//
// This class implements the client side of the protocol defined here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol
//
// The equivalent server code is in src/server/session.
//
// This file is a bit of a mess. I'm dreadfully sorry about that. It passes all the tests,
// so I have hope that its *correct* even if its not clean.
//
// To make a connection, use:
//  new sharejs.Connection(socket)
//
// The socket should look like a websocket connection. It should have the following properties:
//  send(msg): Send the given message. msg may be an object - if so, you might need to JSON.stringify it.
//  close(): Disconnect the session
//
//  onmessage = function(msg){}: Event handler which is called whenever a message is received. The message
//     passed in should already be an object. (It may need to be JSON.parsed)
//  onclose
//  onerror
//  onopen
//  onconnecting
//
// The socket should probably automatically reconnect. If so, it should emit the appropriate events as it
// disconnects & reconnects. (onclose(), onconnecting(), onopen()).

var types, Doc;
if (typeof require !== 'undefined') {
  types = require('ottypes');
  Doc = require('./doc').Doc;
  Query = require('./query').Query;
} else {
  types = window.ottypes;
  Doc = exports.Doc;
}

var Connection = exports.Connection = function (socket) {
  this.socket = socket;

  // Map of collection -> docName -> doc object for created documents.
  // (created documents MUST BE UNIQUE)
  this.collections = {};

  // Each query is created with an id that the server uses when it sends us
  // info about the query (updates, etc).
  //this.nextQueryId = (Math.random() * 1000) |0;
  this.nextQueryId = 1;

  // Map from query ID -> query object.
  this.queries = {};

  // Connection state.
  // 
  // States:
  // - 'connecting': The connection has been established, but we don't have our client ID yet
  // - 'connected': We have connected and recieved our client ID. Ready for data.
  // - 'disconnected': The connection is closed, but it will reconnect automatically.
  // - 'stopped': The connection is closed, and should not reconnect.
  this.state = (socket.readyState === 0 || socket.readyState === 1) ? 'connecting' : 'disconnected';

  // This is a helper variable the document uses to see whether we're currently
  // in a 'live' state. It is true if the state is 'connecting' or 'connected'.
  this.canSend = this.state === 'connecting';

  // Reset some more state variables.
  this.reset();

  this.debug = false;
  // I'll store the most recent 100 messages so when errors occur we can see what happened.
  this.messageBuffer = [];

  var connection = this;

  var handleMessage = function(msg) {
    // Switch on the message action. Most messages are for documents and are
    // handled in the doc class.
    switch (msg.a) {
      case 'init':
        // Client initialization packet. This bundle of joy contains our client
        // ID.
        if (msg.protocol !== 0) throw new Error('Invalid protocol version');
        if (typeof msg.id != 'string') throw new Error('Invalid client id');

        connection.id = msg.id;
        connection._setState('connected');
        break;

      case 'qfetch':
      case 'qsub':
      case 'q':
      case 'qunsub':
        // Query message. Pass this to the appropriate query object.
        var query = connection.queries[msg.id];
        if (query) query._onMessage(msg);
        break;

      default:
        // Document message. Pull out the referenced document and forward the
        // message.
        var collection, docName, doc;
        if (msg.d) {
          collection = connection._lastReceivedCollection = msg.c;
          docName = connection._lastReceivedDoc = msg.d;
        } else {
          collection = msg.c = connection._lastReceivedCollection;
          docName = msg.d = connection._lastReceivedDoc;
        }

        doc = connection.get(collection, docName);
        if (!doc) {
          if (console) console.error('Message for unknown doc. Ignoring.', msg);
          break;
        }
        doc._onMessage(msg);
    }
  };

  // Attach event handlers to the socket.
  socket.onmessage = function(msg) {
    if (connection.debug) console.log('RECV', JSON.stringify(msg));
    connection.messageBuffer.push({t:(new Date()).toTimeString(), recv:JSON.stringify(msg)});
    while (connection.messageBuffer.length > 100) {
      connection.messageBuffer.shift();
    }

    try {
      handleMessage(msg);
    } catch (e) {
      connection.emit('error', e);
      // We could also restart the connection here, although that might result
      // in infinite reconnection bugs.
    }
  }

  socket.onopen = function() {
    connection._setState('connecting');
  };

  socket.onerror = function(e) {
    // This isn't the same as a regular error, because it will happen normally
    // from time to time. Your connection should probably automatically
    // reconnect anyway, but that should be triggered off onclose not onerror.
    // (onclose happens when onerror gets called anyway).
    connection.emit('connection error', e);
  };

  socket.onclose = function(reason) {
    connection._setState('disconnected', reason);
    if (reason === 'Closed' || reason === 'Stopped by server') {
      connection._setState('stopped', reason);
    }
  };
}

/* Why does this function exist? Is it important?
Connection.prototype._error = function(e) {
  this._setState('stopped', e);
  return this.disconnect(e);
};
*/

Connection.prototype.reset = function() {
  this.id = this.lastError =
    this._lastReceivedCollection = this._lastReceivedDoc =
    this._lastSentCollection = this._lastSentDoc = null;

  this.seq = 1;
};

// Set the connection's state. The connection is basically a state machine.
Connection.prototype._setState = function(newState, data) {
  if (this.state === newState) return;

  // I made a state diagram. The only invalid transitions are getting to
  // 'connecting' from anywhere other than 'disconnected' and getting to
  // 'connected' from anywhere other than 'connecting'.
  if ((newState === 'connecting' && (this.state !== 'disconnected' && this.state !== 'stopped'))
      || (newState === 'connected' && this.state !== 'connecting')) {
    throw new Error("Cannot transition directly from " + this.state + " to " + newState);
  }

  this.state = newState;
  this.canSend = newState === 'connecting' || newState === 'connected';

  if (newState === 'disconnected') this.reset();

  this.emit(newState, data);

  // & Emit the event to all documents & queries. It might make sense for
  // documents to just register for this stuff using events, but that couples
  // connections and documents a bit much. Its not a big deal either way.
  this.opQueue = [];
  for (var c in this.collections) {
    var collection = this.collections[c];
    for (var docName in collection) {
      collection[docName]._onConnectionStateChanged(newState, data);
    }
  }

  this.opQueue.sort(function(a, b) { return a.seq - b.seq; });
  for (var i = 0; i < this.opQueue.length; i++) {
    this.send(this.opQueue[i]);
  }
  this.opQueue = null;
  
  for (var id in this.queries) {
    this.queries[id]._onConnectionStateChanged(newState, data);
  }
};

// So, there's an awful error case where the client sends two requests (which
// fail), then reconnects. The documents could have _onConnectionStateChanged
// called in the wrong order and the operations then get sent with reversed
// sequence numbers. This causes the server to incorrectly reject the second
// sent op. So we need to queue the operations while we're reconnecting and
// resend them in the correct order.
Connection.prototype.sendOp = function(data) {
  if (this.opQueue) {
    this.opQueue.push(data);
  } else {
    this.send(data);
  }
};

// Send a message to the connection.
Connection.prototype.send = function(msg) {
  if (this.debug) console.log("SEND", JSON.stringify(msg));
  this.messageBuffer.push({t:(new Date()).toTimeString(), send:JSON.stringify(msg)});
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

  this.socket.send(msg);
};

Connection.prototype.disconnect = function() {
  // This will call @socket.onclose(), which in turn will emit the 'disconnected' event.
  this.socket.close();
};


// ***** Document management

Connection.prototype.getExisting = function(collection, name) {
  if (this.collections[collection]) return this.collections[collection][name];
};

Connection.prototype.getOrCreate = function(collection, name, data) {
  console.trace('getOrCreate is deprecated. Use get() instead');
  return this.get(collection, name, data);
};

// Create a document if it doesn't exist. Returns the document synchronously.
Connection.prototype.get = function(collection, name, data) {
  var doc = this.getExisting(collection, name);

  if (!doc) {
    // Create it.
    doc = new Doc(this, collection, name);

    var collectionObject = this.collections[collection] =
      (this.collections[collection] || {});
    collectionObject[name] = doc;
  }

  // Even if the document isn't new, its possible the document was created
  // manually and then tried to be re-created with data (suppose a query
  // returns with data for the document). We should hydrate the document
  // immediately if we can because the query callback will expect the document
  // to have data.
  if (data && data.snapshot !== undefined && !doc.state) {
    doc.injestData(data);
  }

  return doc;
};

// Call doc.destroy()
Connection.prototype._destroyDoc = function(doc) {
  var collectionObject = this.collections[doc.collection];
  if (!collectionObject) return;

  delete collectionObject[doc.name];

  // Delete the collection container if its empty. This could be a source of
  // memory leaks if you slowly make a billion collections, which you probably
  // won't do anyway, but whatever.
  if (!hasKeys(collectionObject))
    delete this.collections[doc.collection];
};
 
function hasKeys(object) {
  for (var key in object) return true;
  return false;
};

// **** Queries.

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

if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Connection);

