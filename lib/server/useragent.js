var hat = require('hat');
var TransformStream = require('stream').Transform;
var async = require('async');


/**
 * Provides access to the backend of `instance`.
 *
 * Create a user agent accessing a share instance
 *
 *   userAgent = new UserAgent(instance)
 *
 * The user agent exposes the following API to communicate asynchronously with
 * the share instances backend.
 * - submit (submit)
 * - fetch (fetch)
 * - subscribe (subscribe)
 * - getOps (get ops)
 * - query (query)
 * - queryFetch (query)
 *
 *
 * Middleware
 * ----------
 * Each of the API methods also triggers an action (given in brackets) on the
 * share instance. This enables middleware to modifiy the requests and results
 * By default the request passed to the middleware contains the properties
 * - action
 * - agent
 * - backend
 * - collection
 * - docName
 * The `collection` and `docName` properties are only set if applicable. In
 * addition each API method extends the request object with custom properties.
 * These are documented with the methods.
 *
 *
 * Filters
 * -------
 * The documents provided by the `fetch`, `query` and `queryFetch` methods are
 * filtered with the share instance's `docFilters`.
 *
 *   instance.filter(function(collection, docName, docData, next) {
 *     if (docName == "mario") {
 *       docData.greeting = "It'se me: Mario";
 *       next();
 *     } else {
 *       next("Document not found!");
 *     }
 *   });
 *   userAgent.fetch('people', 'mario', function(error, data) {
 *     data.greeting; // It'se me
 *   });
 *   userAgent.fetch('people', 'peaches', function(error, data) {
 *     error == "Document not found!";
 *   });
 *
 * In a filter `this` is the user agent.
 *
 * Similarily we can filter the operations that a client can see
 *
 *   instance.filterOps(function(collection, docName, opData, next) {
 *     if (opData.op == 'cheat')
 *       next("Not on my watch!");
 *     else
 *       next();
 *     }
 *   });
 *
 */
var UserAgent = function(instance, stream) {
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
  var self = this;
  async.eachSeries(filters, function(filter, next) {
    filter.call(self, collection, docName, data, next);
  }, function(error) {
    callback(error, error ? null : data);
  });
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
        // Clean up call stack
        process.nextTick(done);
      });
    }
  }
  done();
};

UserAgent.prototype.filterOps = function(collection, docName, ops, callback) {
  if (!ops) return callback();
  var agent = this;
  var i = 0;
  (function next(err) {
    if (err) return callback(err);
    var op = ops[i++];
    if (op) {
      // Clean up call stack. Would it be better to modulus the iterator and
      // only introduce next tick every nth iteration?
      process.nextTick(function() {
        agent.filterOp(collection, docName, op, next);
      });
    } else {
      callback(null, ops);
    }
  })();
};

/**
 * Builds a request, passes it through the instance's extension stack for the
 * action and calls callback with the request.
 */
UserAgent.prototype.trigger = function(action, collection, docName, request, callback) {
  if (typeof request === 'function') {
    callback = request;
    request = {};
  }

  request.agent = this;
  request.action = action;
  if (collection) request.collection = collection;
  if (docName) request.docName = docName;
  request.backend = this.backend;

  this.instance._trigger(request, callback);
};


/**
 * Fetch current snapshot of a document
 *
 * Triggers the `fetch` action. The actual fetch is performed with collection
 * and docName from the middleware request.
 */
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


/**
 * Get all operations on this document with version in [start, end).
 *
 * Tiggers `get ops` action with requst
 *   { start: start, end: end }
 */
UserAgent.prototype.getOps = function(collection, docName, start, end, callback) {
  var agent = this;

  agent.trigger('get ops', collection, docName, {start:start, end:end}, function(err, action) {
    if (err) return callback(err);

    agent.backend.getOps(action.collection, action.docName, start, end, function(err, results) {
      if (err) return callback(err);

      agent.filterOps(collection, docName, results, callback);
    });
  });
};

function OpTransformStream(agent, collection, docName, stream) {
  TransformStream.call(this, {objectMode: true});
  this.agent = agent;
  this.collection = collection;
  this.docName = docName;
  this.stream = stream;
}

OpTransformStream.prototype = Object.create(TransformStream.prototype);

OpTransformStream.prototype.destroy = function() {
  this.stream.destroy();
};

OpTransformStream.prototype._transform = function(data, encoding, callback) {
  var filterOpCallback = getFilterOpCallback(this, callback);
  this.agent.filterOp(this.collection, this.docName, data, filterOpCallback);
};

function getFilterOpCallback(opTransformStream, callback) {
  return function filterOpCallback(err, data) {
    opTransformStream.push(err ? {error: err} : data);
    callback();
  };
}

/**
 * Filter the data passed through the stream with `filterOp()`
 *
 * Returns a new stream that let's us only read these messages from stream wich
 * where not filtered by `this.filterOp(collection, docName, message)`. If the
 * filter chain calls an error we read a `{error: 'description'}` message from the
 * stream.
 */
UserAgent.prototype.wrapOpStream = function(collection, docName, stream) {
  var opTransformStream = new OpTransformStream(this, collection, docName, stream);
  stream.pipe(opTransformStream);
  return opTransformStream;
};


/**
 * Apply `wrapOpStream()` to each stream
 *
 * `streams` is a map `collection -> docName -> stream`. It returns the same map
 * with the streams wrapped.
 */
UserAgent.prototype.wrapOpStreams = function(streams) {
  for (var cName in streams) {
    for (var docName in streams[cName]) {
      streams[cName][docName] = this.wrapOpStream(cName, docName, streams[cName][docName]);
    }
  }
  return streams;
};


/**
 * Get stream of operations for a document.
 *
 * On success it resturns a readable stream of operations for this document.
 *
 * Triggers the `subscribe` action with request
 *   { version: version }
 */
UserAgent.prototype.subscribe = function(collection, docName, version, callback) {
  var agent = this;
  agent.trigger('subscribe', collection, docName, {version:version}, function(err, action) {
    if (err) return callback(err);
    collection = action.collection;
    docName = action.docName;
    version = action.version;
    agent.backend.subscribe(collection, docName, version, function(err, stream) {
       callback(err, err ? null : agent.wrapOpStream(collection, docName, stream));
    });
  });
};

// requests is a map from cName -> docName -> version.
UserAgent.prototype.bulkSubscribe = function(requests, callback) {
  var agent = this;
  // Use a bulk subscribe to check everything in one go.
  agent.trigger('bulk subscribe', null, null, {requests: requests}, function(err, action) {
    if (err) return callback(err);
    agent.backend.bulkSubscribe(action.requests, function(err, streams) {
      callback(err, err ? null : agent.wrapOpStreams(streams));
    });
  });
};


// DEPRECATED - just call fetch() then subscribe() yourself.
UserAgent.prototype.fetchAndSubscribe = function(collection, docName, callback) {
  var agent = this;
  agent.trigger('fetch', collection, docName, function(err, action) {
    if (err) return callback(err);
    agent.trigger('subscribe', action.collection, action.docName, function(err, action) {
      if (err) return callback(err);

      collection = action.collection;
      docName = action.docName;
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


/**
 * Submits an operation.
 *
 * On success it returns the version and the operation.
 *
 * Triggers the `submit` action with request
 *   { opData: opData, channelPrefix: null }
 * and the `after submit` action with the request
 *   { opData: opData, snapshot: modifiedSnapshot }
 */
UserAgent.prototype.submit = function(collection, docName, opData, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var agent = this;
  agent.trigger('submit', collection, docName, {opData: opData, channelPrefix:null}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    docName = action.docName;
    opData = action.opData;
    options.channelPrefix = action.channelPrefix;

    if (!opData.preValidate) opData.preValidate = agent.instance.preValidate;
    if (!opData.validate) opData.validate = agent.instance.validate;

    agent.backend.submit(collection, docName, opData, options, function(err, v, ops, snapshot) {
      if (err) return callback(err);
      agent.trigger('after submit', collection, docName, {opData: opData, snapshot: snapshot}, function(err) {
        if (err) return callback(err);
        agent.filterOps(collection, docName, ops, function(err, filteredOps) {
          if (err) return callback(err);
          callback(null, v, filteredOps);
        });
      });
    });
  });
};

/** Helper to filter query result sets */
UserAgent.prototype._filterQueryResults = function(collection, results, callback) {
  // The filter function is asyncronous. We can run all of the query results in parallel.
  var agent = this;
  async.each(results, function(data, innerCb) {
    agent.filterDoc(collection, data.docName, data, innerCb);
  }, function(error) {
    callback(error, results);
  });
};


/**
 * Execute a query and fetch matching documents.
 *
 * The result is an array of the matching documents. Each document has in
 * addtion the `docName` property set to its name.
 *
 * Triggers the `query` action with the request
 *   { query: query, fetch: true, options: options }
 */
UserAgent.prototype.queryFetch = function(collection, query, options, callback) {
  var agent = this;
  // Should we emit 'query' or 'query fetch' here?
  agent.trigger('query', collection, null, {query:query, fetch:true, options: options}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    query = action.query;

    agent.backend.queryFetch(collection, query, options, function(err, results, extra) {
      if (err) return callback(err);
      agent._filterQueryResults(collection, results, function(err, results) {
        if (err) return callback(err);
        callback(null, results, extra);
      });
    });
  });
};


/**
 * Get an QueryEmitter for the query
 *
 * The returned emitter fires 'diff' event every time the result of the query
 * changes.
 *
 * Triggers the `query` action with the request
 *   { query: query, options: options }
 */
UserAgent.prototype.query = function(collection, query, options, callback) {
  var agent = this;
  agent.trigger('query', collection, null, {query: query, options: options}, function(err, action) {
    if (err) return callback(err);

    collection = action.collection;
    query = action.query;

    agent.backend.query(collection, query, options, function(err, emitter, results, extra) {
      if (err) return callback(err);

      // Override emitDiff to filter all inserted items
      emitter.emitDiff = function(diff) {
        async.each(diff, function(item, cb) {
          if (item.type === 'insert') {
            agent._filterQueryResults(collection, item.values, cb);
            return;
          }
          cb();
        }, function(err) {
          if (err) return emitter.emitError(err);
          emitter.onDiff(diff);
        });
      };

      // TODO: This is buggy. If the emitter emits a diff during a slow piece of
      // middleware, it'll be lost.
      agent._filterQueryResults(collection, results, function(err, results) {
        // Also if there's an error here, the emitter is never removed.
        if (err) return callback(err);
        callback(null, emitter, results, extra);
      });
    });
  });
};
