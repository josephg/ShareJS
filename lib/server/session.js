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

/**
 * Session deserializes the wire protocol messages received from the stream and
 * calls the corresponding functions on its UserAgent. It uses the return values
 * to send responses back. Session also handles piping the operation streams
 * provided by a UserAgent.
 *
 * @param {ShareInstance} instance
 * @param {Duplex} stream connection to a client
 */
function Session(instance, stream) {
  // The stream passed in should be a nodejs 0.10-style stream.
  this.stream = stream;

  // This is the user agent through which a connecting client acts.  The agent
  // is responsible for making sure client requests are properly authorized,
  // and metadata is kept up to date.
  this.agent = instance.createAgent(stream);
  this.agent.session = this;

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

/**
 * Passes operation data received on opstream to the session stream via
 * _sendOp()
 */
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

// Subscribe to the named document at the specified version. The version is
// optional.
Session.prototype._subscribe = function(collection, docName, v, callback) {
  var self = this;
  // Mark it as subscribing.
  this._setSubscribed(collection, docName, true);

  if (v != null) {
    // This logic is mirrored in _processQueryResults below. If you change
    // how it works, update that function too.
    // Yes, I know I'm a bad person.
    this.agent.subscribe(collection, docName, v, function(err, opstream) {
      if (err) {
        self._setSubscribed(collection, docName, false);
        return callback(err);
      }

      callback();
      self._subscribeToStream(collection, docName, opstream);
    });
  } else {
    this.agent.fetchAndSubscribe(collection, docName, function(err, data, opstream) {
      if (err) {
        self._setSubscribed(collection, docName, false);
        return callback(err);
      }

      callback(null, data);
      self._subscribeToStream(collection, docName, opstream);
    });
  }
};

// Bulk subscribe. The message is:
// {a:'bs', d:{users:{fred:100, george:5, carl:null}, cname:{...}}}
Session.prototype.bulkSubscribe = function(request, callback) {
  // For each document there are three cases:
  // - The document is already subscribed. Do nothing
  // - The client doesn't have a snapshot (v=null). We need to do a fetch then ...
  // - The client has a snapshot already (most common case) and is resubscribing. We need to subscribe.

  // This is a bulk fetch request for all documents that the client doesn't have data for.
  var needFetch = {};

  // The eventual response.
  var response = {};

  for (var cName in request) {
    var docs = request[cName];
    // Every doc in the request will get a response.
    response[cName] = {};
    for (var docName in docs) {
      if (this._isSubscribed(cName, docName)) {
        // Already subscribed. Delete the subscription request.
        response[cName][docName] = {error: 'Already subscribed'};
        delete docs[docName];
      } else {
        // Mark the subscription.
        this._setSubscribed(cName, docName, true);

        // Populate the bulk fetch request.
        if (docs[docName] == null) {
          needFetch[cName] = needFetch[cName] || [];
          needFetch[cName].push(docName);
        }
      }
    }
  }

  // If anything goes wrong from here, we need to cancel the subscribed state on the documents.
  var cancel = function() {
    for (var cName in request) {
      var docs = request[cName];
      for (var docName in docs) {
        this._setSubscribed(cName, docName, false);
      }
    }
  };

  var self = this;
  var agent = this.agent;

  // Next we do a bulkFetch on all the items that need a fetchin'. If no
  // documents need a fetch, this returns into the callback immediately.
  agent.bulkFetch(needFetch, function(err, snapshots) {
    if (err) {
      // For now, just abort the whole bundle on error. We could be more
      // neuanced about this, but I'll wait for a use case.
      cancel();
      return callback(err);
    }

    for (var cName in snapshots) {
      for (var docName in snapshots[cName]) {
        var snapshot = snapshots[cName][docName];
        // Set the version that we'll subscribe to
        request[cName][docName] = snapshot.v;
        // Set the snapshot in the response
        response[cName][docName] = snapshot;
      }
    }

    agent.bulkSubscribe(request, function(err, streams) {
      if (err) {
        cancel();
        return callback(err);
      }

      for (var cName in streams) {
        for (var docName in streams[cName]) {
          // Just give a thumbs up for the subscription.
          response[cName][docName] = response[cName][docName] || true;

          self._subscribeToStream(cName, docName, streams[cName][docName]);
        }
      }

      callback(null, response);
    });
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

    if (req.a === 'op') {
      if (req.v != null && (typeof req.v !== 'number' || req.v < 0)) return 'Invalid version';
    }
  } else if (req.a === 'bs') {
    // Bulk subscribe
    if (typeof req.s !== 'object') return 'Invalid bulk subscribe data';
  } else {
    return 'Invalid action';
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
        message.data = r.data;
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
        //
        // Note that between when the client sent the subscription request and
        // now it might have submitted an operation, which will have bumped its
        // version. We might be subscribing at an old version. The doc class
        // will silently discard duplicate (old) operations in this case.
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
  } else if (req.a !== 'bs') {
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

          callback(null, {data: data});
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
      this._subscribe(collection, docName, req.v, function(err, data) {
        if (err)
          callback(err);
        else
          callback(null, {data:data});
      });
      break;

    case 'bs':
      this.bulkSubscribe(req.s, function(err, response) {
        callback(err, err ? null : {s:response});
      });
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

// For debugging, this returns information on how many documents & queries are currently subscribed.
Session.prototype.subscribeStats = function() {
  var stats = {};

  for (var c in this.collections) {
    var count = 0;

    for (var d in this.collections[c]) {
      if (this.collections[c][d]) count++;
    }

    stats[c] = count;
  }

  return stats;
};

