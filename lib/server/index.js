var session = require('./session');
var rest = require('./rest');
var useragent = require('./useragent');
var livedb = require('livedb');

if (!require('semver').gte(process.versions.node, '0.10.0')) {
  throw new Error('ShareJS requires node 0.10 or above.');
}

/** This encapsulates the sharejs server state & exposes a few useful methods.
 *
 * @constructor
 */
var ShareInstance = function(options) {
  this.options = options;

  this.preValidate = options.preValidate;
  this.validate = options.validate;

  if (options.backend) {
    this.backend = options.backend;
  } else if (options.db) {
    this.backend = livedb.client(options.db);
  } else {
    throw Error("Both options.backend and options.db are missing. Can't function without a database!");
  }

  if (!this.backend.bulkSubscribe)
    throw Error("You're using an old version of livedb. Please update livedb or downgrade ShareJS");

  // Map from event name (or '') to a list of middleware.
  this.extensions = {'':[]};
  this.docFilters = [];
  this.opFilters = [];
};

/** A client has connected through the specified stream. Listen for messages.
 * Returns the useragent associated with the connected session.
 *
 * The optional second argument (req) is an initial request which is passed
 * through to any connect() middleware. This is useful for inspecting cookies
 * or an express session or whatever on the request object in your middleware.
 *
 * (The useragent is available through all middleware)
 */
ShareInstance.prototype.listen = function(stream, req) {
  return session(this, stream, req).agent;
};

// Create and return REST middleware to access the documents
ShareInstance.prototype.rest = function() {
  return rest(this);
};


/** Add middleware to an action. The action is optional (if not specified, the
 * middleware fires on every action).
 */
ShareInstance.prototype.use = function(action, middleware) {
  if (typeof action !== 'string') {
    middleware = action;
    action = '';
  }

  if (action === 'getOps') {
    throw new Error("The 'getOps' middleware action has been renamed to 'get ops'. Update your code.");
  }

  var extensions = this.extensions[action];
  if (!extensions) extensions = this.extensions[action] = [];

  extensions.push(middleware);
};


/** Add a function to filter all data going to the current client */
ShareInstance.prototype.filter = function(fn) {
  this.docFilters.push(fn);
};

ShareInstance.prototype.filterOps = function(fn) {
  this.opFilters.push(fn);
};

ShareInstance.prototype.createAgent = function(stream) {
  return useragent(this, stream);
};

// Return truthy if the instance has registered middleware. Used for bulkSubscribe.
ShareInstance.prototype._hasMiddleware = function(action) {
  return this.extensions[action];
};

// Helper method to actually trigger the extension methods
ShareInstance.prototype._trigger = function(request, callback) {
  // Copying the triggers we'll fire so they don't get edited while we iterate.
  var middlewares = (this.extensions[request.action] || []).concat(this.extensions['']);

  var next = function() {
    if (!middlewares.length)
      return callback ? callback(null, request) : undefined;

    var middleware = middlewares.shift();
    middleware(request, function(err) {
      if (err) return callback ? callback(err) : undefined;

      next();
    });
  };

  next();
};

exports.createClient = function(options) {
  return new ShareInstance(options);
};

