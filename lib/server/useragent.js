var hat = require('hat');
var Transform = require('stream').Transform;
var EventEmitter = require('events').EventEmitter;
var async = require('async');


/**
 * Facade for ShareInstance. Exposes the same api as a LiveDB instance for
 * interaction with Documents.
 *
 * To obtain results for its methods it triggers requests on `instance` and
 * relies on it to provide the results.
 */
var UserAgent = module.exports = function(instance) {
  this.instance = instance;
  this.sessionId = hat();
};


/**
 * Builds a request, passes it through the instance's middleware stack for the
 * action and calls callback with the response.
 */
UserAgent.prototype.trigger = function(action, request, callback) {
  request.agent = this;
  request.action = action;

  // process.nextTick because the client assumes that it is receiving messages
  // asynchronously and if you have a syncronous stream, we need to force it to
  // be asynchronous
  var instance = this.instance;
  process.nextTick(function() {
    instance.process(action, request, callback);
  });
};


/**
 * Fetch current snapshot of a document
 */
UserAgent.prototype.fetch = function(collection, docName, callback) {
  this.trigger('fetch', {collection: collection, docName: docName}, callback);
};

var bulkFetchRequestsEmpty = function(requests) {
  for (var cName in requests) {
    if (requests[cName].length) return false;
  }
  return true;
};


/**
 * Fetches documents in bulk
 *
 * @param {object} requests map from collection -> [docName]
 * @return {object} map from collection -> docName -> data
 */
UserAgent.prototype.bulkFetch = function(requests, callback) {
  if (bulkFetchRequestsEmpty(requests)) 
    callback(null, {});
  else
    this.trigger('bulk fetch', {requests: requests}, callback);
};


/**
 * Get all operations on this document with version in [start, end).
 */
UserAgent.prototype.getOps = function(collection, docName, start, end, callback) {
  this.trigger('get ops',
               { collection: collection, docName: docName, start: start, end: end },
               callback);
};



/**
 * Get stream of operations for a document.
 *
 * On success it resturns a readable stream of operations for this document.
 */
UserAgent.prototype.subscribe = function(collection, docName, version, callback) {
  this.trigger('subscribe',
               { collection: collection, docName: docName, version: version},
               callback);
};


/**
 * Get stream of operations for a list of documents.
 *
 * @param {object} requests map collection -> docName -> version
 * @return {object} map collection -> docName -> operationStream, where operationStream
 *         is readable
 */
UserAgent.prototype.bulkSubscribe = function(requests, callback) {
  this.trigger('bulk subscribe', {requests: requests}, callback);
};


/**
 * Callback is called with data from `fetch()` as first and opstream from
 * `subscribe` as second argument.
 *
 * @deprecated
 */
UserAgent.prototype.fetchAndSubscribe = function(collection, docName, callback) {
  var agent = this;
  agent.fetch(collection, docName, function(err, data){
    if (err) {
      if (callback) callback(err);
      return;
    }
    agent.subscribe(collection, docName, data.v, function(err, opstream){
      if(callback) callback(err, data, opstream);
    });
  });
};


/**
 * Submit an operation.
 *
 * On success it returns the version and the operation.
 */
UserAgent.prototype.submit = function(collection, docName, opData, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var agent = this;
  agent.trigger('submit',
                { collection: collection, docName: docName,
                  opData: opData, channelPrefix: null },
                function(err, version, operation, snapshot) {
    // TODO make into middleware
    agent.trigger('after submit',
                  { collection: collection, docName: docName,
                    opData: opData, channelPrefix: null }, function(err) {
      callback(err, version, operation);
    });
  });
};


/**
 * Execute a query and fetch matching documents.
 *
 * The result is an array of the matching documents. Each document has in
 * addtion the `docName` property set to its name.
 */
UserAgent.prototype.queryFetch = function(collection, query, options, callback) {
  // Should we emit 'query' or 'query fetch' here?
  this.trigger('queryFetch',
               {collection: collection, query: query, fetch:true, options: options},
               callback);
};


/**
 * Get an event emitter for the query
 *
 * The returned emitter fires 'diff' event every time the result of the query
 * changes. In addition the emitter has a `data` property containing the initial
 * result for the query.
 */
UserAgent.prototype.query = function(collection, query, options, callback) {
  this.trigger('query',
               {collection: collection, query: query, options: options},
               callback);
};
