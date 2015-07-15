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
module.exports = Session;

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

  // We need to track which documents are subscribed by the client. This is a
  // map of collection name -> {doc name: stream || true || false}
  this.collections = {};

  // Map from query ID -> emitter.
  this.queries = {};

  // Subscriptions care about the stream being destroyed. We end up with a
  // listener per subscribed document for the client, which can be a lot.
  stream.setMaxListeners(0);

  // We need to track this manually to make sure we don't reply to messages
  // after the stream was closed. There's no built-in way to ask a stream
  // whether its actually still open.
  this.closed = false;

  stream.once('end', this._cleanup.bind(this));

  // Initialize the remote client by sending it its session Id.
  this._send({a:'init', protocol:0, id:this.agent.sessionId});
}

Session.prototype._cleanup = function() {
  if (this.closed) return
  this.closed = true;

  // Remove the pump listener
  this.stream.removeAllListeners('readable');

  // Clean up all the subscriptions.
  for (var c in this.collections) {
    for (var docName in this.collections[c]) {
      var value = this.collections[c][docName];
      // Value can be true, false or a stream. true means we're in the
      // process of subscribing the client.
      if (typeof value === 'object') {
        destroyStream(value);
      }
      this.collections[c][docName] = false; // cancel the subscribe
    }
  }

  for (var id in this.queries) {
    var emitter = this.queries[id];
    emitter.destroy();
    delete this.queries[id];
  }
};

// Close the session with the client.
Session.prototype.close = function(err) {
  if (err) {
    console.warn('Session closed due to error', err);
    this.stream.emit('error', err);
  }
  if (this.closed) return;
  // This will emit 'end', which will call _cleanup
  this.stream.end();
};

// Mark a document as subscribed or unsubscribed. The value is stored
// associated with the subscription. It is set to true (subscribing), false
// (unsubscribed) or the actual operation stream.
Session.prototype._setSubscribed = function(collection, docName, value) {
  var docs = this.collections[collection] || (this.collections[collection] = {});
  // Check to see if already subscribed
  var previous = docs[docName];
  if (typeof value === 'object') {
    if (previous !== true) {
      // The document has been unsubscribed or replaced with another stream
      // already. Either way, we destroy the new stream, since the existing
      // stream should have been subscribed the whole time. Possible I might be
      // missing some race condition and we might miss a message (nateps)
      destroyStream(value);
      return previous;
    }
  } else if (value === true) {
    // Reject replacing subscribed stream or subscribing state with
    // a new subscribing state
    if (previous) {
      // Return existing stream or subscribing state on failure
      return previous;
    }
  } else {
    // Unsubscribe
    if (typeof previous === 'object') {
      destroyStream(previous);
    }
  }
  // Set to new value
  docs[docName] = value;
  // Returns nothing on success
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
  var previous = this._setSubscribed(collection, docName, opstream);
  // Our set was rejected and our stream was destroyed, so just return
  if (previous) return;

  var self = this;
  // This should use the new streams API instead of the old one.
  opstream.on('data', onData);
  function onData(data) {
    self._sendOp(collection, docName, data);
  };
  opstream.once('end', function() {
    // Livedb has closed the op stream. What do we do here? Normally this
    // shouldn't happen unless we're cleaning up, so I'll assume thats whats
    // happening now.
    self._setSubscribed(collection, docName, false);
    opstream.removeListener('data', onData);
  });
};

// Subscribe to the named document at the specified version. The version is
// optional.
Session.prototype._subscribe = function(collection, docName, v, callback) {
  var self = this;
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
      self._subscribeToStream(collection, docName, opstream);
      callback();
    });
  } else {
    // Rewrite me to not use fetchAndSubscribe.
    this.agent.fetchAndSubscribe(collection, docName, function(err, data, opstream) {
      if (err) {
        self._setSubscribed(collection, docName, false);
        return callback(err);
      }
      self._subscribeToStream(collection, docName, opstream);
      callback(null, data);
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
      // Mark the subscription.
      this._setSubscribed(cName, docName, true);

      // Populate the bulk fetch request.
      if (docs[docName] == null) {
        needFetch[cName] = needFetch[cName] || [];
        needFetch[cName].push(docName);
      }
    }
  }

  var self = this;
  var agent = this.agent;

  // Next we do a bulkFetch on all the items that need a fetchin'. If no
  // documents need a fetch, this returns into the callback immediately.
  agent.bulkFetch(needFetch, function(err, snapshots) {
    if (err) {
      // For now, just abort the whole bundle on error. We could be more
      // neuanced about this, but I'll wait for a use case.
      self._cancelBulk(request);
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
        self._cancelBulk(request);
        return callback(err);
      }

      for (var cName in streams) {
        for (var docName in streams[cName]) {
          // Just give a thumbs up for the subscription.
          response[cName][docName] = response[cName][docName] || true;

          var v = request[cName][docName].v;
          self._subscribeToStream(cName, docName, streams[cName][docName]);
        }
      }

      callback(null, response);
    });
  });
};

Session.prototype._cancelBulk = function(request) {
  // Cancel the subscribed state on the documents.
  for (var cName in request) {
    var docs = request[cName];
    for (var docName in docs) {
      this._setSubscribed(cName, docName, false);
    }
  }
};

// Send a message to the remote client.
Session.prototype._send = function(msg) {
  // Quietly drop replies if the stream was closed
  if (this.closed) return;

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

  // In theory, we only need to send the operation data if data.src !==
  // this.agent.sessionId. However, this doesn't work with projections because
  // the client needs to see their own operations in the projected collection.
  //
  // I'd like to reinstate this optimization, but I can't think of a good way to
  // do it while making projections work. For now, you get your own operations
  // back.
  if (data.op) msg.op = data.op;
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

  if (req.c) msg.c = req.c; // collection
  if (req.d) msg.d = req.d; // docName
  if (req.id) msg.id = req.id;

  this._send(msg);
};

// start processing events from the stream. This calls itself recursively.
// Use .close() to drain the pump.
Session.prototype.pump = function() {
  if (this.closed) return;

  var req = this.stream.read();
  var self = this;

  if (req != null) {
    if (typeof req === 'string') {
      try {
        req = JSON.parse(req);
      } catch(e) {
        console.warn('Client sent invalid JSON', e.stack);
        self.close(e);
      }
    }
    this._handleMessage(req, function(err, msg) {
      if (err || msg) self._reply(req, err, msg);

      // This is in a process.nextTick to avoid stack smashing attacks (since
      // sometimes this callback function is called synchronously).
      process.nextTick(function() {
        self.pump();
      });
    });
  } else {
    // Retry when there's a message waiting for us.
    this.stream.once('readable', this.pump.bind(this));
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
Session.prototype._processQueryResults = function(collection, results, qopts) {
  var self = this;
  var messages = [];

  // Types are only put in the result set for the first result and every time the type changes.
  var lastType = null;
  results.forEach(function(r) {
    var docName = r.docName;

    var message = {c:collection, d:docName, v:r.v};
    messages.push(message);

    if (lastType !== r.type) {
      lastType = message.type = r.type;
    }

    if (qopts.docMode) {
      var atVersion = qopts.versions && qopts.versions[collection] && qopts.versions[collection][docName];
      // Only give the client snapshot data if the client requested it and they
      // don't already have a copy of the document.
      if (atVersion == null) {
        message.data = r.data;
      } else if (r.v > atVersion) {
        // We won't put any op data into the response, but we'll send some
        // normal ops to follow the query. This might not be the best idea - it
        // means that sometimes the query will say that a document matches
        // before you get the document's updated data.
        self.agent.getOps(collection, docName, atVersion, -1, function(err, results) {
          if (err) {
            self._send({a:'fetch', c:collection, d:docName, error:err});
            return;
          }
          for (var i = 0; i < results.length; i++) {
            self._sendOp(collection, docName, results[i]);
          }
        });
      }
    }
  });

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

      // The client tells us what versions it already has
      qopts.versions = req.o.vs;

      // Enables polling mode, which forces the query to be rerun on the whole
      // index, not just the edited document.
      qopts.poll = req.o.p;

      // Set the backend for the request (useful if you have a SOLR index or something)
      qopts.backend = req.o.b;
    }
  } else if (req.a !== 'bs') {
    var collection = req.c;
    var docName = req.d;
  }

  var self = this;
  var agent = this.agent;

  // Now process the actual message.
  switch (req.a) {
    case 'fetch':
      // Fetch request.
      if (req.v != null) {
        // It says fetch on the tin, but if a version is specified the client
        // actually wants me to fetch some ops.
        agent.getOps(collection, docName, req.v, null, function(err, results) {
          if (err) return callback(err);

          for (var i = 0; i < results.length; i++) {
            self._sendOp(collection, docName, results[i]);
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
      // opstream or an inflight subscribing state
      this._setSubscribed(collection, docName, false);
      callback(null, {});
      break;

    case 'op':
      // Submit an operation.
      //
      // Shallow clone to get just the op data parts.
      var opData = {
        // src can be provided if it is not the same as the current session,
        // such as a resubmission after a reconnect, but it usually isn't needed
        src: req.src || agent.sessionId,
        seq: req.seq,
        v: req.v
      };
      if (req.op) opData.op = req.op;
      if (req.create) opData.create = req.create;
      if (req.del) opData.del = req.del;

      // There's nothing to put in here yet. We might end up with some stuff
      // from the client.
      var options = {};

      // Actually submit the op to the backend
      agent.submit(collection, docName, opData, options, function(err, v, ops) {
        // Occassional 'Op already submitted' errors are expected to happen
        // as part of normal operation, since inflight ops need to be resent
        // after disconnect
        if (err) {
          console.error('Op error:', err, collection, docName, opData, options);
          if (err === 'Op already submitted') {
            self._sendOp(collection, docName, opData);
          }
          callback(null, {a: 'ack', error: err});
          return;
        }

        // The backend replies with any operations that the client is missing.
        // If the client is subscribed to the document, it'll get those
        // operations through the regular subscription channel. If the client
        // isn't subscribed, we'll send the ops with the response as if it was
        // subscribed so the client catches up.
        if (!self._isSubscribed(collection, docName)) {
          for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (!op) {
              console.warn('Null op ignored in agent.submit callback.', collection, docName, opData, v, ops);
              continue;
            }
            self._sendOp(collection, docName, op);
          }
          // Luckily, the op is transformed & etc in place.
          self._sendOp(collection, docName, opData);
        }
        callback(null, {a: 'ack'});
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
        var data = self._processQueryResults(req.c, results, qopts);

        callback(null, {id:qid, data:data, extra:extra});
        //self._reply(req, null, {id:qid, data:results, extra:extra});
      });
      break;

    case 'qsub':
      // Subscribe to a query. The client is sent the query results and its
      // notified whenever there's a change.
      agent.query(index, req.q, qopts, function(err, emitter, results, extra) {
        if (err) return callback(err);
        if (self.queries[qid]) {
          emitter.destroy();
          return callback('ID in use');
        }
        if (self.closed) return emitter.destroy();

        // `emitter` is a QueryEmitter passed through from LiveDB that emits
        // events whenever the results change. Livedb is responsible for
        // rerunning queries in the most efficient (or most expedient) manner.
        self.queries[qid] = emitter;

        emitter.onExtra = function(extra) {
          self._send({a: 'q', id: qid, extra: extra});
        };

        // Note that only the docMode and not the full qopts is used, since
        // qopts has the doc versions for the original subscription, and this
        // emitter is sending an update from an ongoing subscription
        var insertQueryOptions = {docMode: qopts.docMode};
        emitter.onDiff = function(diff) {
          for (var i = 0; i < diff.length; i++) {
            var d = diff[i];
            if (d.type === 'insert') {
              d.values = self._processQueryResults(req.c, d.values, insertQueryOptions);
            }
          }

          // Consider stripping the collection out of the data we send here
          // if it matches the query's index.
          self._send({a:'q', id:qid, diff:diff});
        };

        emitter.onError = function(err) {
          // Should we destroy the emitter here?
          self._send({a:'q', id:qid, error:err});
          console.warn('Query ' + index + '.' + JSON.stringify(req.q) + ' emitted an error:', err);
          emitter.destroy();
          delete self.queries[qid];
        };

        emitter.onOp = function(data) {
          var collection = data.collection;
          var docName = data.docName;
          // No need to send from the query if the doc is also subscribed
          if (self._isSubscribed(collection, docName)) return;
          // ShareJS filter middleware that might be doing access control or something
          agent.filterOp(collection, docName, data, function(err, filtered) {
            if (err) return emitter.onError(err);
            self._sendOp(collection, docName, filtered);
          });
        };

        var data = self._processQueryResults(req.c, results, qopts);
        callback(null, {id: qid, data: data, extra: extra});
      });
      break;

    case 'qunsub':
      // Unsubscribe from a query.
      var emitter = self.queries[qid];
      if (emitter) {
        emitter.destroy();
        delete self.queries[qid];
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

function hasKeys(object) {
  for (var key in object) return true;
  return false;
}

// Destroy a linked list of streams
function destroyStream(opstream) {
  opstream.destroy();
  opstream.removeAllListeners('data');
}
