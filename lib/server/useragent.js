var hat = require('hat');
var Transform = require('stream').Transform;
var EventEmitter = require('events').EventEmitter;
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
 */
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
 *
 * Triggers the `fetch` action. The actual fetch is performed with collection
 * and docName from the middleware request.
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

// requests is a map from collection -> [docName]
// TODO
UserAgent.prototype.bulkFetch = function(requests, callback) {
  if (bulkFetchRequestsEmpty(requests)) 
    callback(null, {});
  else
    this.trigger('bulk fetch', {requests: requests}, callback);
};


/**
 * Get all operations on this document with version in [start, end).
 *
 * Tiggers `get ops` action with request
 *   { start: start, end: end }
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
 *
 * Triggers the `subscribe` action with request
 *   { version: version }
 */
UserAgent.prototype.subscribe = function(collection, docName, version, callback) {
  this.trigger('subscribe',
               { collection: collection, docName: docName, version: version},
               callback);
};


/**
 * Get stream of operations for a list of documents.
 *
 * @param requests A map collection -> docName -> version
 * @return A map collection -> docName -> operationStream, where operationStream
 *         is readable
 */
UserAgent.prototype.bulkSubscribe = function(requests, callback) {
  this.trigger('bulk subscribe', {requests: requests}, callback);
};


// DEPRECATED - just call fetch() then subscribe() yourself.
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
  agent.trigger('submit',
                { collection: collection, docName: docName,
                  opData: opData, channelPrefix: null },
                function(err, version, operations, snapshot) {
    // TODO make into middleware
    agent.trigger('after submit',
                  { collection: collection, docName: docName,
                    opData: opData, channelPrefix: null }, function(err) {
      callback(err, version, operations);
    });
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
 *
 * Triggers the `query` action with the request
 *   { query: query, options: options }
 */
UserAgent.prototype.query = function(collection, query, options, callback) {
  this.trigger('query',
               {collection: collection, query: query, options: options},
               callback);
};


UserAgent.prototype.stats = function() {
  if (this.session)
    return this.session.subscribeStats();
  else
    return {};
};
