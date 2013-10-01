var hat = require('hat');
var Transform = require('stream').Transform;
var EventEmitter = require('events').EventEmitter;
var async = require('async');

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
 * or nothing on success.  Data is modified in place.
 */
UserAgent.prototype._runFilters = function(filters, collection, docName, data, callback) {
  // TODO: Replace this with async.something.
  var i = 0;
  var self = this;
  (function next(err) {
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

// This is only used by bulkFetch, but its enough logic that I prefer to
// separate it out.
//
// data is a map from collection name -> doc name -> data.
UserAgent.prototype.filterDocs = function(data, callback) {
  var work = 1;
  var done = function() {
    work--;
    if (work === 0 && callback) callback(null, data);
  }

  for (var cName in data) {
    for (var docName in data[cName]) {
      work++;
      this.filterDoc(cName, docName, data[cName][docName], function(err) {
        if (err && callback) {
          callback(err);
          callback = null;
        }

        done();
      });
    }
  }

  done();
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

var bulkFetchRequestsEmpty = function(requests) {
  for (var cName in requests) {
    if (requests[cName].length) return false;
  }
  return true;
};

// requests is a map from collection -> [docName]
UserAgent.prototype.bulkFetch = function(requests, callback) {
  var agent = this;

  if (bulkFetchRequestsEmpty(requests)) return callback(null, {});

  if (this.instance._hasMiddleware('bulk fetch') || !this.instance._hasMiddleware('fetch')) {
    agent.trigger('bulk fetch', null, null, {requests:requests}, function(err, action) {
      if (err) return callback(err);
      requests = action.requests;

      agent.backend.bulkFetch(requests, function(err, data) {
        if (err) return callback(err);

        agent.filterDocs(data, callback);
      });
    });
  } else {
    // Could implement this using async...
    throw Error('If you have fetch middleware you need to also make bulk fetch middleware');
  }
};

UserAgent.prototype.getOps = function(collection, docName, start, end, callback) {
  var agent = this;

  agent.trigger('get ops', collection, docName, {start:start, end:end}, function(err, action) {
    if (err) return callback(err);

    agent.backend.getOps(action.collection, action.docName, start, end, function(err, results) {
      if (err) return callback(err);

      if (results) {
        var i = 0;
        (function next(err) {
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

// requests is a list of [{collection, docName}]. streams is a list of streams.
// Objects must line up in both arrays.
UserAgent.prototype.wrapOpStreams = function(streams) {
  for (var cName in streams) {
    for (var docName in streams[cName]) {
      streams[cName][docName] = this.wrapOpStream(cName, docName, streams[cName][docName]);
    }
  }

  return streams;
};

UserAgent.prototype.subscribe = function(collection, docName, version, callback) {
  var agent = this;
  agent.trigger('subscribe', collection, docName, {version:version}, function(err, action) {
    if (err) return callback(err);
    collection = action.collection;
    docName = action.docName;
    agent.backend.subscribe(action.collection, action.docName, action.version, function(err, stream) {
       callback(err, err ? null : agent.wrapOpStream(collection, docName, stream));
    });
  });
};

// requests is a map from cName -> docName -> version.
UserAgent.prototype.bulkSubscribe = function(requests, callback) {
  var agent = this;
  if (this.instance._hasMiddleware('bulk subscribe') || !this.instance._hasMiddleware('subscribe')) {
    // Use a bulk subscribe to check everything in one go.
    agent.trigger('bulk subscribe', null, null, {requests:requests}, function(err, action) {
      if (err) return callback(err);
      requests = action.requests;

      agent.backend.bulkSubscribe(requests, function(err, streams) {
        callback(err, err ? null : agent.wrapOpStreams(streams));
      });
    });
  } else {
    return callback('Not implemented');



    async.each(requests, function(request, callback) {
      agent.trigger('subscribe', request.collection, request.docName, {version:request.v}, function(err, action) {
        if(err) return callback(err);

        request.collection = action.collection;
        request.docName = action.docName;
        request.v = action.version;
        callback();
      });
    }, function(err) {
      if (err) return callback(err);
      
      agent.backend.bulkSubscribe(requests, function(err, streams) {
        callback(err, err ? null : agent.wrapOpStreams(streams));
      });
    });
  }
};


// DEPRECATED - just call fetch() then subscribe() yourself.
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
          (function next(err) {
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

UserAgent.prototype.stats = function() {
  if (this.session)
    return this.session.subscribeStats();
  else
    return {};
};

// 'query', 


// filter snapshot
// filter op
// validate new data


