var hat = require('hat');
var Transform = require('stream').Transform;
var EventEmitter = require('events').EventEmitter;

var UserAgent = function(instance, stream) {
  if (!(this instanceof UserAgent)) return new UserAgent(instance, stream);

  this.instance = instance;
  this.backend = instance.backend;

  this.stream = stream;
  this.sessionId = hat();

  this.connectTime = new Date();
};

module.exports = UserAgent;

/**
 * Helper to run the filters over some data. Returns an error string on error,
 * or nothing on success.  Data is modified.
 *
 * Synchronous.
 */
UserAgent.prototype._runFilters = function(filters, collection, docName, data, callback) {
  var i = 0;
  var self = this;
  (function next (err) {
    if (err) return callback(err);
    var filter = filters[i++];
    if (filter) {
      try {
        filter.call(self, collection, docName, data, next);
      } catch (e) {
        console.warn('filter threw an exception. Bailing.');
        console.error(e.stack);
        callback(e.message)
      }
    } else {
      callback(null, data);
    }
  })();
};

UserAgent.prototype.filterDoc = function(collection, docName, data, callback) {
  return this._runFilters(this.instance.docFilters, collection, docName, data, callback);
};
UserAgent.prototype.filterOp = function(collection, docName, data, callback) {
  return this._runFilters(this.instance.opFilters, collection, docName, data, callback);
};

/** Helper to trigger actions */
UserAgent.prototype.trigger = function(action, collection, docName, extraFields, callback) {
  if (typeof extraFields === 'function') {
    callback = extraFields;
    extraFields = {};
  }

  var request = extraFields;
  request.agent = this;
  request.action = action;
  if (collection) request.collection = collection;
  if (docName) request.docName = docName;
  request.backend = this.backend;


  // process.nextTick because the client assumes that it is receiving messages
  // asynchronously and if you have a syncronous stream, we need to force it to
  // be asynchronous
  var instance = this.instance;
  process.nextTick(function() {
    instance._trigger(request, callback);
  });
};

UserAgent.prototype.fetch = function(collection, docName, callback) {
  var agent = this;

  agent.trigger('fetch', collection, docName, function(err, action) {
    if (err) return callback(err);
    collection = action.collection;
    docName = action.docName;

    agent.backend.fetch(collection, docName, function(err, data) {
      if (err) return callback(err);
      if (data) {
        agent.filterDoc(collection, docName, data, callback);
      } else {
        callback(null, data);
      }
    });
  });
};

UserAgent.prototype.getOps = function(collection, docName, start, end, callback) {
  var agent = this;

  agent.trigger('get ops', collection, docName, {start:start, end:end}, function(err, action) {
    if (err) return callback(err);

    agent.backend.getOps(action.collection, action.docName, start, end, function(err, results) {
      if (err) return callback(err);

      if (results) {
        var i = 0;
        (function next (err) {
          if (err) return callback(err);
          var result = results[i++];
          if (result) agent.filterOp(collection, docName, result, next);
          else callback(null, results);
        })();
      } else {
        callback(null, results);
      }
    });
  });
};

/** Helper function to filter & rewrite wrap a stream of operations */
UserAgent.prototype.wrapOpStream = function(collection, docName, stream) {
  var agent = this;
  var passthrough = new Transform({objectMode:true});

  passthrough._transform = function(data, encoding, callback) {
    agent.filterOp(collection, docName, data, function (err, data) {
      passthrough.push(err ? {error: err} : data);
      callback();
    });
  };

  passthrough.destroy = function() { stream.destroy(); };

  stream.pipe(passthrough);

  return passthrough;
};

UserAgent.prototype.subscribe = function(collection, docName, version, callback) {
  var agent = this;
  agent.trigger('subscribe', collection, docName, {version:version}, function(err, action) {
    if (err) return callback(err);
    collection = action.collection;
    docName = agent.docName;
    agent.backend.subscribe(action.collection, action.docName, action.version, function(err, stream) {
       callback(err, err ? err : agent.wrapOpStream(collection, docName, stream));
    });
  });
};

UserAgent.prototype.fetchAndSubscribe = function(collection, docName, callback) {
  var agent = this;
  agent.trigger('fetch', collection, docName, function(err, action) {
    if (err) return callback(err);
    agent.trigger('subscribe', action.collection, action.docName, function(err, action) {
      if (err) return callback(err);

      collection = action.collection;
      docName = agent.docName;
      agent.backend.fetchAndSubscribe(action.collection, action.docName, function(err, data, stream) {
        if (err) return callback(err);
        agent.filterDoc(collection, docName, data, function (err, data) {
          if (err) return callback(err);
          var wrappedStream = agent.wrapOpStream(collection, docName, stream);
          callback(null, data, wrappedStream);
        });
      });
    });
  });
};

UserAgent.prototype.submit = function(collection, docName, opData, options, callback) {
  var agent = this;
  agent.trigger('submit', collection, docName, {opData: opData, channelPrefix:null}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    docName = action.docName;
    opData = action.opData;
    options.channelPrefix = action.channelPrefix;

    if (!opData.preValidate) opData.preValidate = agent.instance.preValidate;
    if (!opData.validate) opData.validate = agent.instance.validate;

    agent.backend.submit(collection, docName, opData, options, function (err, v, ops, snapshot) {
      if (err) return callback(err);
      agent.trigger('after submit', collection, docName, {opData: opData, snapshot: snapshot}, function(err) {
        callback(err, v, ops);
      });
    });
  });
};

/** Helper to filter query result sets */
UserAgent.prototype._filterQueryResults = function(collection, results, callback) {
  if (results.length === 0) return callback(null, results);

  var pending = 0;
  var lastError = null;
  // The filter function is asyncronous. We can run all of the query results in parallel.
  for (var i = 0; i < results.length; i++) {
    var data = results[i];
    this.filterDoc(collection, data.docName, data, function(err) {
      if (err) lastError = err;
      if (++pending === results.length) callback(lastError, results);
    });
  }
};

UserAgent.prototype.queryFetch = function(collection, query, options, callback) {
  var agent = this;
  // Should we emit 'query' or 'query fetch' here?
  agent.trigger('query', collection, null, {query:query, fetch:true, options: options}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    query = action.query;

    agent.backend.queryFetch(collection, query, options, function(err, results, extra) {
      if (err) return callback(err);
      if (results) {
        agent._filterQueryResults(collection, results, function (err, results) {
          if (err) return callback(err);
          callback(null, results, extra);
        });
      } else {
        callback(null, results, extra);
      }
    });
  });
};

UserAgent.prototype.query = function(collection, query, options, callback) {
  var agent = this;
  agent.trigger('query', collection, null, {query:query, options:options}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    query = action.query;

    //console.log('query', query, options);
    agent.backend.query(collection, query, options, function(err, emitter) {
      if (err) return callback(err);
      agent._filterQueryResults(collection, emitter.data, function (err, data) {
        if (err) return callback(err);
        // Wrap the query result event emitter
        var wrapped = new EventEmitter();
        wrapped.data = emitter.data;
        wrapped.extra = emitter.extra; // Can't filter this data. BE CAREFUL!

        wrapped.destroy = function() { emitter.destroy(); };

        emitter.on('diff', function(diff) {
          var i = 0;
          (function next (err) {
            if (err) return wrapped.emit('error', err);
            var curr = diff[i++];
            if (curr) {
              if (curr.type === 'insert') {
                agent._filterQueryResults(collection, curr.values, next);
              } else {
                next();
              }
            } else {
              wrapped.emit('diff', diff);
            }
          })();
        });
        emitter.on('extra', function(extra) {
          wrapped.emit('extra', extra);
        });

        callback(null, wrapped);
      });

    });
  });
};

// 'query', 


// filter snapshot
// filter op
// validate new data


