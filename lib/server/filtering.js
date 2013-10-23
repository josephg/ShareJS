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
 *   instance.useOpFilterMiddleware();
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
  this.use('bulk fetch', bulkFetchFilterMiddleware(this));
  this.use('query', queryFilterMiddleware(this));
  this.use('query fetch', queryFetchFilterMiddleware(this));
};



/**
 * Install middlware that filters operations on the `get ops` and `subscribe`
 * actions.
 */
ShareInstance.prototype.useOpFilterMiddleware = function() {
  this.use('get ops', getOpsFilterMiddleware(this));
  this.use('subscribe', subscriptionFilterMiddleware(this));
  this.use('bulk subscribe', bulkSubscriptionFilterMiddleware(this));
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


function bulkFetchFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, response) {
      if (error) return respond(error);
      var docList = [];
      var collection;
      for (var cName in response) {
        collection = response[cName];
        for (var dName in collection) {
          docList.push({cName: cName, dName: dName, data: collection[dName]});
        }
      }
      async.each(docList, function(doc, next){
        filter(instance.docFilters, doc.cName, doc.dName, doc.data, next);
      }, function(error) {
        respond(error, response);
      });
    });
  };
}


function fetchFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, response) {
      if (error) return respond(error);
      filter(instance.docFilters, req.collection, req.docName, response, respond);
    });
  };
}


function queryFetchFilterMiddleware(instance) {
  return function(req, next, respond){
    next(function(error, results, extra) {
      if (error) return respond(error);
      filterDocList(instance.docFilters, req.collection, results, function(error, filtered) {
        respond(error, filtered, extra);
      });
    });
  };
}


function queryFilterMiddleware(instance) {
  return function(req, next, respond){
    var collection = req.collection;
    next(function(error, query) {
      if (error) return respond(error);

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


function getOpsFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, operations) {
      if (error) return respond(error);
      async.each(operations, function(operation, next){
        filter(instance.opFilters, req.collection, req.docName, operation, next);
      }, function(error) {
        respond(error, operations);
      });
    });
  };
}


function subscriptionFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, stream) {
      if (error) return respond(error);
      respond(error, filterStream(stream, req.collection,
                                  req.docName,instance.opFilters));
    });
  };
}


function bulkSubscriptionFilterMiddleware(instance) {
  return function(req, next, respond) {
    next(function(error, streams) {
      if (error) return respond(error);
      var collection;
      for (var cName in streams) {
        collection = streams[cName];
        for (var dName in collection) {
          collection[dName] = filterStream(collection[dName], cName, dName,
                                           instance.opFilters);
        }
      }
      respond(error, streams);
    });
  };
}


/**
 * Filter the data read from stream
 *
 * @param {Readable} stream
 * @param {String} collection The name of the collection the stream belongs to
 * @param {String} document   The name of the document the stream belongs to
 * @param {Array} filters Array of filters that are called for every message
 *                        read from the stream
 * @return {Readable}
 */
function filterStream(stream, collection, document, filters) {
  var filtered = new Transform({objectMode:true});

  filtered._transform = function(data, encoding, callback) {
    filter(filters, collection, document, data, function (err) {
      filtered.push(err ? {error: err} : data);
      callback();
    });
  };

  filtered.destroy = function() { stream.destroy(); };
  stream.pipe(filtered);

  return filtered;
}
