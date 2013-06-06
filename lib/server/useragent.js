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
UserAgent.prototype._runFilters = function(filters, collection, docName, data) {
  try {
    for (var i = 0; i < filters.length; i++) {
      var err = filters[i].call(this, collection, docName, data);
      if (err) return err;
    }
  } catch (e) {
    console.warn('filter threw an exception. Bailing.');
    console.error(e.stack);
    return e.message;
  }
};

UserAgent.prototype.filterDoc = function(collection, docName, data) {
  return this._runFilters(this.instance.docFilters, collection, docName, data);
};
UserAgent.prototype.filterOp = function(collection, docName, data) {
  return this._runFilters(this.instance.opFilters, collection, docName, data);
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

  this.instance._trigger(request, callback);
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
        err = agent.filterDoc(collection, docName, data);
      }
      callback(err, err ? null : data);
    });
  });
};

UserAgent.prototype.getOps = function(collection, docName, start, end, callback) {
  var agent = this;

  agent.trigger('getOps', collection, docName, {start:start, end:end}, function(err, action) {
    if (err) return callback(err);

    agent.backend.getOps(action.collection, action.docName, start, end, function(err, results) {
      if (err) return callback(err);

      if (results) {
        for (var i = 0; i < results.length; i++) {
          err = agent.filterOp(collection, docName, results[i]);

          // If there's an error, throw away all the results and return the error to the client.
          if (err) callback(err);
        }
      }
      callback(null, results);
    });
  });
};

/** Helper function to filter & rewrite wrap a stream of operations */
UserAgent.prototype.wrapOpStream = function(collection, docName, stream) {
  var agent = this;
  var passthrough = new Transform({objectMode:true});

  passthrough._transform = function(data, encoding, callback) {
    var err = agent.filterOp(collection, docName, data);
    if (err) {
      passthrough.push({error:err});
    } else {
      passthrough.push(data);
    }
    callback();
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
        if (!err && data) err = agent.filterDoc(collection, docName, data);

        if (err) return callback(err);

        var stream = agent.wrapOpStream(collection, docName, stream);
        callback(null, data, stream);
      });
    });
  });
};

UserAgent.prototype.submit = function(collection, docName, opData, callback) {
  var agent = this;
  opData.preValidate = function(opData, oldSnapshot, callback) {
    agent.trigger('submit', collection, docName, {opData: opData, oldSnapshot: oldSnapshot}, callback);
  };
  opData.validate = function(opData, snapshot, callback) {
    agent.trigger('validate', collection, docName, {opData:opData, snapshot:snapshot}, callback);
  };
  agent.backend.submit(collection, docName, opData, function (err, v, ops, snapshot) {
    if (err) return callback(err);
    agent.trigger('after submit', collection, docName, {ops: ops, snapshot: snapshot}, function(err) {
      callback(err, v, ops);
    });
  });
};

/** Helper to filter query result sets */
UserAgent.prototype._filterQueryResults = function(results) {
  for(var i = 0; i < results.length; i++) {
    var data = results[i];
    var err = this.filterDoc(data.c, data.docName, data);

    // If there's an error, throw away all the results. You can't have 'em!
    if (err) return err;
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
      if (results) err = agent._filterQueryResults(results);
      if (err) callback(err);
      else callback(null, results, extra);
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
      if (!err && emitter) err = agent._filterQueryResults(emitter.data);
      if (err) return callback(err);

      // Wrap the query result event emitter
      var wrapped = new EventEmitter();
      wrapped.data = emitter.data;
      wrapped.extra = emitter.extra; // Can't filter this data. BE CAREFUL!

      wrapped.destroy = function() { emitter.destroy(); };

      emitter.on('diff', function(diff) {
        for (var i = 0; i < diff.length; i++) {
          if (diff[i].type === 'insert') {
            agent._filterQueryResults(diff[i].values);
          }
        }

        wrapped.emit('diff', diff);
      });
      emitter.on('extra', function(extra) {
        wrapped.emit('extra', extra);
      });

      callback(null, wrapped);
    });
  });
};

// 'query', 


// filter snapshot
// filter op
// validate new data


