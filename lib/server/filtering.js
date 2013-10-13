var async = require('async');
var Transform = require('stream').Transform;
var EventEmitter = require('events').EventEmitter;

/**
 * This mixin extends the share instance with filtering capabilites for
 * documents and operations.
 *
 *   instance.useDocFilterMiddleware();
 *   instance.docFilter(function(collection, docName, docData, callback) {
 *     if (docData.version > 100)
 *       docData.data.mature = true;
 *     callback();
 *   });
 *
 *   instance.useopFilterMiddleware();
 *   instance.opFilter(function(collection, docName, opData, callback) {
 *     if (opData.del)
 *       callback('Not on my watch');
 *     else
 *       callback();
 *   });
 * 
 * Document filters are applied to the `fetch`, `query` and `queryFetch`
 * actions. Operation filters to `get ops` and `subscribe`.
 */
module.exports = function(ShareInstance) {


/**
 * Install middlware that filters documents from the fetch and queryFetch
 * actions.
 */
ShareInstance.prototype.useDocFilterMiddleware = function() {
  this.use('fetch', fetchFilterMiddleware(this));
  this.use('query', queryFilterMiddleware(this));
  this.use('queryFetch', queryFetchFilterMiddleware(this));
};



/**
 * Install middlware that filters operations on the `get ops` and `subscribe`
 * actions.
 */
ShareInstance.prototype.useOpFilterMiddleware = function() {
  this.use('get ops', getOpsFilterMiddleware(this));
  this.use('subscribe', subscriptionFilterMiddleware(this));
};


/**
 * Add a filter for documents
 *
 * The argument is function with signature
 *   filter(collection, docName, docData, callback)
 */
ShareInstance.prototype.docFilter = function(filter) {
  this.docFilters.push(filter);
};

};


/**
 * Runs filters on each element of the docList and returns the the docList
 * again.
 *
 * @param docList[].docName Name of the document
 */
function filterDocList(filters, collection, docList, callback) {
  async.each(docList, function(data, callback){
    filter(filters, collection, data.docName, data, callback);
  }, function(error) {
    callback(error, docList);
  });
}


/**
 * Run all filters on a document or operation
 */
function filter(filters, collection, docName, data, callback) {
  async.eachSeries(filters, function(filter, next) {
    filter(collection, docName, data, next);
  }, function(error) {
    callback(error, data);
  });
}


/**
 * Factory to generate middleware that filters fetch requests
 */
function fetchFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, response) {
      filter(instance.docFilters, req.collection, req.docName, response, respond);
    });
  };
}


/**
 * Factory to generate middleware that filters queryFetch requests
 */
function queryFetchFilterMiddleware(instance) {
  return function(req, next, respond){
    next(function(error, results, extra) {
      filterDocList(instance.docFilters, req.collection, results, function(error, filtered) {
        respond(error, filtered, extra);
      });
    });
  };
}


/**
 * Factory to generate middleware that filters query requests
 */
function queryFilterMiddleware(instance) {
  return function(req, next, respond){
    var collection = req.collection;
    next(function(error, query) {
      if (error) respond(error);

      var filtered = new EventEmitter();

      query.on('diff', function(diffs) {
        async.each(diffs, function(diff, next) {
          if (diff.type === 'insert')
            filterDocList(instance.docFilters, collection, diff.values, next);
          else
            next();
        }, function(error) {
          if (error)
            filtered.emit('error', error);
          else
            filtered.emit('diff', diffs);
        });
      });

      query.on('extra', function(extra) {
        filtered.emit('extra', extra);
      });
    
      filtered.destroy = function() { query.destroy(); };
      filtered.extra = query.extra;
      filterDocList(instance.docFilters, collection, query.data, function(error, filteredDocList){
        filtered.data = filteredDocList;
        respond(error, filtered);
      });
    });
  };
}


/**
 * Factory to generate middleware that filters operations on `get ops` requests
 */
function getOpsFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, operations) {
      async.each(operations, function(operation, next){
        filter(instance.opFilters, req.collection, req.docName, operation, next);
      }, function(error) {
        respond(error, operations);
      });
    });
  };
}


/**
 * Factory to generate middleware that filters subscription stream
 */
function subscriptionFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, stream) {
      var filtered = new Transform({objectMode:true});

      filtered._transform = function(data, encoding, callback) {
        filter(instance.opFilters, req.collection, req.docName, data, function (err) {
          filtered.push(err ? {error: err} : data);
          callback();
        });
      };

      filtered.destroy = function() { stream.destroy(); };
      stream.pipe(filtered);

      respond(error, filtered);
    });
  };
}
