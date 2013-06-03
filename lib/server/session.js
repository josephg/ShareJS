// This implements the network API for ShareJS.
//
// The wire protocol is speccced out here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol
//
// When a client connects the server first authenticates it and sends:
//
// S: {id:<agent session id>}
//
// After that, the client can open documents:
//
// C: {c:'users', doc:'fred', sub:true, snapshot:null, create:true, type:'text'}
// S: {c:'users', doc:'fred', sub:true, snapshot:{snapshot:'hi there', v:5, meta:{}}, create:false}
//
// ...
//
// The client can send open requests as soon as the socket has opened - it doesn't need to
// wait for its id.
//
// The wire protocol is documented here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol

var hat = require('hat');

// stream is a nodejs 0.10 stream object.
/**
 * @param {ShareInstance} instance
 * @param {Duplex} stream
 * @param {Http.Request} req
 */
module.exports = function(instance, stream, req) {
  var session = new Session(instance, stream);
  session.agent.trigger('connect', null, null, {stream:stream, req:req}, function(err) {
    if (err) return session.close(err);
    session.pump();
  });
  return session;
};

function Session(instance, stream) {
  // The stream passed in should be a nodejs 0.10-style stream.
  this.stream = stream;

  // This is the user agent through which a connecting client acts.  The agent
  // is responsible for making sure client requests are properly authorized,
  // and metadata is kept up to date.
  this.agent = instance.createAgent(stream);

  // To save on network traffic, the agent & server can leave out the docName
  // with each message to mean 'same as the last message'
  this.lastSentCollection = this.lastSentDoc = null;
  this.lastReceivedCollection = this.lastReceivedDoc = null;

  // The connection should tag message source and sequence numbers of ops it
  // generates. However, for ops our client generates, its kind of redundant to
  // send back the client ID with each op generated. We'll just figure out the
  // src and seq on the server side.
  this.seq = 1;

  // We need to track which documents are subscribed by the client. This is a
  // map of collection name -> {doc name: stream}
  this.collections = {};

  // Map from query ID -> stream.
  this.queries = {};

  // Subscriptions care about the stream being destroyed. We end up with a
  // listener per subscribed document for the client, which can be a lot.
  stream.setMaxListeners(0);

  // Initialize the remote client by sending it its session Id.
  this._send({a:'init', protocol:0, id:this.agent.sessionId});
}

// Close the session with the client.
Session.prototype.close = function(err) {
  if (err) {
    console.warn(err);
    this.stream.emit('error', err);
  }
  this.stream.end();
  this.stream.emit('close');
  this.stream.emit('end');
};

// Mark a document as subscribed or unsubscribed. The value is stored
// associated with the subscription. It is set to true (subscribing), false
// (unsubscribed) or the actual operation stream.
Session.prototype._setSubscribed = function(c, doc, value) {
  var docs = (this.collections[c] || (this.collections[c] = {}));
  docs[doc] = value;
};

// Check whether or not the document is subscribed by this session.
Session.prototype._isSubscribed = function(c, doc) {
  return this.collections[c] && this.collections[c][doc];
};

// Actually subscribe to the specified stream.
Session.prototype._subscribeToStream = function(collection, doc, opstream) {
  this._setSubscribed(collection, doc, opstream);
  var session = this;

  // This should use the new streams API instead of the old one.
  opstream.on('data', function(data) {
    session._sendOp(collection, doc, data);
  });
  opstream.on('finish', function() {
    opstream.destroy();
  });
};

// Send a message to the remote client.
Session.prototype._send = function(msg) {
  // All document-related messages should have a collection & doc set. The only
  // messages that are exempt are query messages.
  if (msg.c && msg.doc) {
    if (msg.c === this.lastSentCollection && msg.doc === this.lastSentDoc) {
      delete msg.c;
      delete msg.doc;
    } else {
      this.lastSentCollection = msg.c;
      this.lastSentDoc = msg.doc;
    }
  }

  this.stream.write(msg);
};

Session.prototype._sendOp = function(collection, doc, data) {
  var msg = {
    a: 'op',
    c: collection,
    doc: doc,
    v: data.v,
    src: data.src,
    seq: data.seq
  };

  if (data.op && data.src !== this.agent.sessionId) msg.op = data.op;
  if (data.create) msg.create = data.create;
  if (data.del) msg.del = true;

  this._send(msg);
};

Session.prototype._reply = function(req, err, msg) {
  if (err) {
    msg = {a:req.a, error:err};
  } else {
    if (!msg.a) msg.a = req.a;
  }

  if (req.c) msg.c = req.c;
  if (req.doc) msg.doc = req.doc;
  if (req.id) msg.id = req.id;

  this._send(msg);
};

// start processing events from the stream. This calls itself recursively.
// Use .close() to drain the pump.
Session.prototype.pump = function() {
  var req = this.stream.read();
  var session = this;

  if (req) {
    this._handleMessage(req, function(err, msg) {
      if (err || msg) session._reply(req, err, msg);

      // This is in a process.nextTick to avoid stack smashing attacks (since
      // sometimes this callback function is called synchronously).
      process.nextTick(function() {
        session.pump();
      });
    });
  } else {
    this.stream.once('readable', function() {
      session.pump();
    });
  }
};

// Check a request to see if its valid. Returns an error if there's a problem.
Session.prototype._checkRequest = function(req) {
  if (req.a === 'qsub' || req.a === 'qfetch' || req.a === 'qunsub') {
    // Query messages need an ID property.
    if (typeof req.id !== 'number') return 'Missing query ID';
  } else if (req.a === 'op' || req.a === 'sub' || req.a === 'unsub' || req.a === 'fetch') {
    // Doc-based request.
    if (req.doc != null && typeof req.doc !== 'string') return 'Invalid docName';
    if (req.c != null && typeof req.c !== 'string') return 'Invalid collection';
  } else {
    return 'Invalid action';
  }

  if (req.a === 'op') {
    if (req.v != null && (typeof req.v !== 'number' || req.v < 0)) return 'Invalid version';
  }
};

// Because I'm a moron, in livedb the snapshot data objects in
// results look like {v:, type:, data:}. ShareJS expects them to have
// {v:, type:, snapshot:}. So I have to rewrite them.
var rewriteQueryResults = function(autoFetch, results) {
  for (var i = 0; i < results.length; i++) {
    var r = results[i];

    // Only keep the snapshot data if the client requested it (using the
    // autofetch option).
    if (autoFetch) r.snapshot = r.data;
    delete r.data;
  }
};

// Handle an incoming message from the client. This is the actual guts of session.js.
Session.prototype._handleMessage = function(req, callback) {
  // First some checks of the incoming request. Error will be set to a value if a problem is found.
  var error;
  if ((error = this._checkRequest(req))) {
    console.warn('Warning: Invalid request from ', this.agent.sessionId, req, 'Error: ', error);
    return callback(error);
  }

  if (req.a === 'qsub' || req.a === 'qfetch' || req.a === 'qunsub') {
    // Query based request.

    // Queries have an ID to refer to the particular query in the client
    var qid = req.id;

    // The index that will handle the query request. For mongo queries, this is
    // simply the collection that contains the data.
    var index = req.c;

    // Options for liveDB.query.
    var qopts = {};

    // Do we send back document snapshots for the results?
    var autofetch = false;

    if (req.o) {
      autofetch = req.o.f;
      qopts.poll = req.o.p;
      qopts.backend = req.o.b;
    }
  } else {
    // Document based query.
    if (req.doc === null) {
      // If the doc is null, we should generate a unique doc ID for the client.
      this.lastReceivedCollection = req.c;
      req.doc = this.lastReceivedDoc = hat();
    } else if (req.doc !== undefined) {
      this.lastReceivedCollection = req.c;
      this.lastReceivedDoc = req.doc;
    } else {
      if (!this.lastReceivedDoc || !this.lastReceivedCollection) {
        console.warn("msg.doc or collection missing in req " + JSON.stringify(req) + " from " + this.agent.sessionId);
        return callback('c or doc missing');
      }

      req.c = this.lastReceivedCollection;
      req.doc = this.lastReceivedDoc;
    }

    var doc = req.doc;
    var collection = req.c;
  }

  var session = this;
  var agent = this.agent;

  // Now process the actual message.
  switch (req.a) {
    case 'fetch':
      // Fetch request.
      if (req.v != null) {
        // It says fetch on the tin, but if a version is specified the client
        // actually wants me to fetch some ops.
        agent.getOps(collection, doc, req.v, -1, function(err, results) {
          if (err) return callback(err);

          for (var i = 0; i < results.length; i++) {
            session._sendOp(collection, doc, results[i]);
          }

          callback(null, {});
        });
      } else {
        // Fetch a snapshot.
        agent.fetch(collection, doc, function(err, data) {
          if (err) return callback(err);

          callback(null, {data: {
            v: data.v,
            type: data.type,
            snapshot: data.data,
            meta: data.meta
          }});
        });
      }
      break;

    case 'sub':
      // Subscribe to a document. If the version is specified, we'll catch the
      // client up by sending all ops since the specified version.
      //
      // If the version is not specified, the client doesn't have a snapshot
      // yet. We'll send them a snapshot at the most recent version and stream
      // operations from that version.

      if (this._isSubscribed(collection, doc)) return callback('Already subscribed');

      // Mark it as subscribing.
      this._setSubscribed(collection, doc, true);

      if (req.v != null) {
        agent.subscribe(collection, doc, req.v, function(err, opstream) {
          if (err) {
            session._setSubscribed(collection, doc, false);
            return callback(err);
          }

          callback(null, {});
          session._subscribeToStream(collection, doc, opstream);
        });
      } else {
        agent.fetchAndSubscribe(collection, doc, function(err, data, opstream) {
          if (err) {
            session._setSubscribed(collection, doc, false);
            return callback(err);
          }

          callback(null, {data: {
            v: data.v,
            type: data.type,
            snapshot: data.data,
            meta: data.meta
          }});
          session._subscribeToStream(collection, doc, opstream);
        });
      }
      break;

    case 'unsub':
      // Unsubscribe from the specified document. This cancels the active
      // opstream.
      var opstream = this._isSubscribed(collection, doc);
      if (!opstream) return callback('Already unsubscribed');

      // There is almost a race condition here. When the document is being
      // subscribed, isSubscribed will return true, not the stream object.
      // However, because requests are processed in order from the client, its
      // impossible for a subscribe and unsub message to be processed at the
      // same time.
      opstream.destroy();
      this._setSubscribed(collection, doc, false);
      callback(null, {});
      break;

    case 'op':
      // Submit an operation.
      //
      // Shallow clone to get just the op data parts.
      var opData = {op:req.op, v:req.v, src:req.src, seq:req.seq};
      if (req.create) opData.create = req.create;
      if (req.del) opData.del = req.del;

      // Fill in the src and seq with the client's data if its missing.
      if (!req.src) {
        opData.src = agent.sessionId;
        opData.seq = this.seq++;
      }

      // Actually submit the op to the backend
      agent.submit(collection, doc, opData, function(err, v, ops) {
        if (err) return callback(null, {a:'ack', error:err});

        // The backend replies with any operations that the client is missing.
        // If the client is subscribed to the document, it'll get those
        // operations through the regular subscription channel. If the client
        // isn't subscribed, we'll send the ops with the response as if it was
        // subscribed so the client catches up.
        if (!session._isSubscribed(collection, doc)) {
          for (var i = 0; i < ops.length; i++)
            session._sendOp(collection, doc, ops[i]);
          // Luckily, the op is transformed & etc in place.
          session._sendOp(collection, doc, opData);
        }

        callback(null, {a:'ack'});
      });
      break;


    // ********* Queries **********

    case 'qfetch':
      // Fetch the results of a query. This does not subscribe to the query or
      // anything, its just a once-off query fetch.
      agent.queryFetch(index, req.q, qopts, function(err, results, extra) {
        if (err) return callback(err);

        rewriteQueryResults(autofetch, results);

        callback(null, {id:qid, data:results, extra:extra});
      });
      break;

    case 'qsub':
      // Subscribe to a query. The client is sent the query results and its
      // notified whenever there's a change.
      agent.query(index, req.q, qopts, function(err, emitter) {
        if (err) return callback(err);
        if (session.queries[qid]) return callback('ID in use');

        // 'emitter' is an event emitter passed through from LiveDB that emits
        // events whenever the results change. Livedb is responsible for
        // rerunning queries in the most efficient (or most expedient) manner.
        //
        // Note that although the emitter looks the same as what LiveDB
        // produces, the useragent code actually proxies the event emitter here
        // so it can rewrite & check any results that pass through.
        session.queries[qid] = emitter;

        // The actual query results are simply mixed in to the emitter (in
        // emitter.data).
        rewriteQueryResults(autofetch, emitter.data);

        callback(null, {id:qid, data:emitter.data, extra:emitter.extra});

        emitter.on('extra', function(extra) {
          session._send({a:'q', id:qid, extra:extra});
        });

        emitter.on('diff', function(diff) {
          for (var i = 0; i < diff.length; i++) {
            var d = diff[i];
            if (d.type === 'insert') {
              rewriteQueryResults(autofetch, d.values);
            }
          }

          // Consider stripping the collection out of the data we send here
          // if it matches the query's index.
          session._send({a:'q', id:qid, diff:diff});
        });

        emitter.on('error', function(err) {
          // Should we destroy the emitter here?
          session._send({a:'q', id:qid, error:err});
          delete session.queries[qid];
        });
      });
      break;

    case 'qunsub':
      // Unsubscribe from a query.
      var query = session.queries[qid];
      if (query) {
        query.destroy();
        delete session.queries[qid];
      }
      callback();
      break;

    default:
      console.warn('invalid message', req);
      callback('invalid or unknown message');
  }
};

