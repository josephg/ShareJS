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
// C: {c:'users', d:'fred', sub:true, snapshot:null, create:true, type:'text'}
// S: {c:'users', d:'fred', sub:true, snapshot:{snapshot:'hi there', v:5, meta:{}}, create:false}
//
// ...
//
// The client can send open requests as soon as the socket has opened - it doesn't need to
// wait for its id.
//
// The wire protocol is documented here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol

var hat = require('hat');
var assert = require('assert');

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

  // Map from query ID -> emitter.
  this.queries = {};

  // Subscriptions care about the stream being destroyed. We end up with a
  // listener per subscribed document for the client, which can be a lot.
  stream.setMaxListeners(0);

  var session = this;
  stream.on('end', function() {
    //console.log('ended client connection');
    // Clean up all the subscriptions.
    for (var c in session.collections) {
      for (var docName in session.collections[c]) {
        var value = session.collections[c][docName];
        // Value can be true, false or a stream. true means we're in the
        // process of subscribing the client.
        if (typeof value === 'object') {
          value.destroy();
        }
        value = false; // cancel the subscribe
      }
    }

    for (var id in session.queries) {
      var emitter = session.queries[id];
      emitter.destroy();
    }
  });

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
Session.prototype._setSubscribed = function(c, docName, value) {
  var docs = (this.collections[c] || (this.collections[c] = {}));
  docs[docName] = value;
};

// Check whether or not the document is subscribed by this session.
Session.prototype._isSubscribed = function(c, docName) {
  return this.collections[c] && this.collections[c][docName];
};

// Actually subscribe to the specified stream.
Session.prototype._subscribeToStream = function(collection, docName, opstream) {
  var value = this._isSubscribed(collection, docName);
  if (!value) {
    // The document has been unsubscribed already. Cancel the subscription.
    opstream.destroy();
    return;
  }

  this._setSubscribed(collection, docName, opstream);
  var session = this;

  // This should use the new streams API instead of the old one.
  opstream.on('data', function(data) {
    session._sendOp(collection, docName, data);
  });
  opstream.on('finish', function() {
    opstream.destroy();
  });
};

// Send a message to the remote client.
Session.prototype._send = function(msg) {
  // All document-related messages should have a collection & doc set. The only
  // messages that are exempt are query messages.
  if (msg.c && msg.d) {
    if (msg.c === this.lastSentCollection && msg.d === this.lastSentDoc) {
      delete msg.c;
      delete msg.d;
    } else {
      this.lastSentCollection = msg.c;
      this.lastSentDoc = msg.d;
    }
  }

  this.stream.write(msg);
};

Session.prototype._sendOp = function(collection, docName, data) {
  var msg = {
    a: 'op',
    c: collection,
    d: docName,
    v: data.v,
    src: data.src,
    seq: data.seq
  };

  if (data.src !== this.agent.sessionId) {
    if (data.op) msg.op = data.op;
    if (data.create) msg.create = data.create;
    if (data.del) msg.del = true;
  }

  this._send(msg);
};

Session.prototype._reply = function(req, err, msg) {
  if (err) {
    msg = {a:req.a, error:err};
  } else {
    if (!msg.a) msg.a = req.a;
  }

  if (req.c) msg.c = req.c; // collection
  if (req.d) msg.d = req.d; // docName
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
    if (req.c != null && typeof req.c !== 'string') return 'Invalid collection';
    if (req.d != null && typeof req.d !== 'string') return 'Invalid docName';
  } else {
    return 'Invalid action';
  }

  if (req.a === 'op') {
    if (req.v != null && (typeof req.v !== 'number' || req.v < 0)) return 'Invalid version';
  }
};

// This function takes in results from livedb and returns a results set to be
// sent to the sharejs client.
//
// Because I'm a moron, in livedb the snapshot data objects in
// results look like {c:, docName:, v:, type:, data:}. ShareJS expects them to have
// {c:, docName:, v:, type:, snapshot:}. So I have to rewrite them.
Session.prototype._processQueryResults = function(results, qopts) {
  var session = this;
  var messages = [];

  // Types are only put in the result set for the first result and every time the type changes.
  var lastType = null;
  for (var i = 0; i < results.length; i++) {
    var r = results[i];

    var collection = r.c;
    var docName = r.docName;

    var message = {c:collection, d:docName, v:r.v};
    messages.push(message);

    if (lastType !== r.type) {
      lastType = message.type = r.type;
    }

    if (qopts.docMode && !this._isSubscribed(collection, docName)) {
      var atVersion = qopts.versions[collection] && qopts.versions[collection][docName];
      // Only give the client snapshot data if the client requested it and they
      // don't already have a copy of the document.
      if (atVersion == null) {
        message.snapshot = r.data;
      } else if (qopts.docMode === 'fetch' && r.v > atVersion) {
        // We won't put any op data into the response, but we'll send some
        // normal ops to follow the query. This might not be the best idea - it
        // means that sometimes the query will say that a document matches
        // before you get the document's updated data.
        (function(collection, docName) {
          session.agent.getOps(collection, docName, atVersion, -1, function(err, results) {
            if (err) {
              session._send({a:'fetch', c:collection, d:docName, error:err});
              return;
            }

            // Make sure the ops don't get set until after the original query is replied to.
            process.nextTick(function() {
              for (var i = 0; i < results.length; i++) {
                session._sendOp(collection, docName, results[i]);
              }
            });
          });
        })(collection, docName);
      }
      
      if (qopts.docMode === 'sub') {
        // Subscribe to the document automatically if we aren't already subscribed
        // & subscription was requested. This code feels brittle to me, both
        // because the error case is handled specially and because the logic around
        // subscriptions is repeated in the subscribe message below.
        this._setSubscribed(collection, docName, true);
        (function(collection, docName) {
          session.agent.subscribe(collection, docName, atVersion || r.v, function(err, opstream) {
            if (err) {
              session._setSubscribed(collection, docName, false);
              session._send({a:'sub', c:collection, d:docName, error:err});
              return;
            }

            session._subscribeToStream(collection, docName, opstream);
          });
        })(collection, docName);
      }
    }
  }

  return messages;
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

    if (req.o) {
      // Do we send back document snapshots for the results? Either 'fetch' or 'sub'.
      qopts.docMode = req.o.m;
      if (qopts.docMode != null && qopts.docMode !== 'fetch' && qopts.docMode !== 'sub')
        return callback('invalid query docmode: ' + qopts.docMode);
      // Fill in known query data a previous session. Ignored if docMode isn't defined.
      qopts.versions = req.o.vs;
      // Enables polling mode, which forces the query to be rerun on the whole
      // index, not just the edited document.
      qopts.poll = req.o.p;
      // Set the backend for the request (useful if you have a SOLR index or something)
      qopts.backend = req.o.b;
    }
  } else {
    // Document based query.
    if (req.d === null) {
      // If the doc is null, we should generate a unique doc ID for the client.
      // This is not currently tested and probably broken. Don't tell people
      // about this feature.
      this.lastReceivedCollection = req.c;
      req.d = this.lastReceivedDoc = hat();
    } else if (req.d !== undefined) {
      this.lastReceivedCollection = req.c;
      this.lastReceivedDoc = req.d;
    } else {
      if (!this.lastReceivedDoc || !this.lastReceivedCollection) {
        console.warn("msg.d or collection missing in req " + JSON.stringify(req) + " from " + this.agent.sessionId);
        return callback('collection or docName missing');
      }

      req.c = this.lastReceivedCollection;
      req.d = this.lastReceivedDoc;
    }

    var collection = req.c;
    var docName = req.d;
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
        agent.getOps(collection, docName, req.v, -1, function(err, results) {
          if (err) return callback(err);

          for (var i = 0; i < results.length; i++) {
            session._sendOp(collection, docName, results[i]);
          }

          callback(null, {});
        });
      } else {
        // Fetch a snapshot.
        agent.fetch(collection, docName, function(err, data) {
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

      if (this._isSubscribed(collection, docName)) return callback('Already subscribed');

      // Mark it as subscribing.
      this._setSubscribed(collection, docName, true);

      if (req.v != null) {
        // This logic is mirrored in _processQueryResults above. If you change
        // how it works, update that function too.
        // Yes, I know I'm a bad person.
        agent.subscribe(collection, docName, req.v, function(err, opstream) {
          if (err) {
            session._setSubscribed(collection, docName, false);
            return callback(err);
          }

          callback(null, {});
          session._subscribeToStream(collection, docName, opstream);
        });
      } else {
        agent.fetchAndSubscribe(collection, docName, function(err, data, opstream) {
          if (err) {
            session._setSubscribed(collection, docName, false);
            return callback(err);
          }

          callback(null, {data: {
            v: data.v,
            type: data.type,
            snapshot: data.data,
            meta: data.meta
          }});
          session._subscribeToStream(collection, docName, opstream);
        });
      }
      break;

    case 'unsub':
      // Unsubscribe from the specified document. This cancels the active
      // opstream.
      var opstream = this._isSubscribed(collection, docName);
      if (!opstream) return callback('Already unsubscribed');

      if (typeof opstream === 'object') {
        // The document is only half open. We'll _setSubscribed to
        // false and rely on the subscribe callback to destroy the event stream.
        opstream.destroy();
      }
      this._setSubscribed(collection, docName, false);
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

      // There's nothing to put in here yet. We might end up with some stuff
      // from the client.
      var options = {};

      // Actually submit the op to the backend
      agent.submit(collection, docName, opData, options, function(err, v, ops) {
        if (err) {
          console.trace(err);
        }
        if (err) return callback(null, {a:'ack', error:err});

        // The backend replies with any operations that the client is missing.
        // If the client is subscribed to the document, it'll get those
        // operations through the regular subscription channel. If the client
        // isn't subscribed, we'll send the ops with the response as if it was
        // subscribed so the client catches up.
        if (!session._isSubscribed(collection, docName)) {
          for (var i = 0; i < ops.length; i++)
            session._sendOp(collection, docName, ops[i]);
          // Luckily, the op is transformed & etc in place.
          session._sendOp(collection, docName, opData);
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

        // If the query subscribes to documents, the callback isn't called
        // until all the documents are subscribed.
        var data = session._processQueryResults(results, qopts);

        callback(null, {id:qid, data:data, extra:extra});
        //session._reply(req, null, {id:qid, data:results, extra:extra});
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
        // emitter.data). Callback called in a process.nextTick(), at the earliest.
        var data = session._processQueryResults(emitter.data, qopts);

        // Its possible that this will be called even when there's an error
        // subscribing or something. In that case, just the failed subscribe
        // will error to the client.
        //session._reply(req, null, {id:qid, data:emitter.data, extra:emitter.extra});
        callback(null, {id:qid, data:data, extra:emitter.extra});

        emitter.on('extra', function(extra) {
          session._send({a:'q', id:qid, extra:extra});
        });

        emitter.on('diff', function(diff) {
          for (var i = 0; i < diff.length; i++) {
            var d = diff[i];
            if (d.type === 'insert') {
              d.values = session._processQueryResults(d.values, qopts);
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

