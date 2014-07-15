var session = require('./session');
var rest = require('./rest');
var useragent = require('./useragent');
var livedb = require('livedb');

module.exports = ShareServer;

/* This encapsulates the sharejs server state & exposes a few useful methods.
 *
 * options is an object with one of:
 * - .backend property, which is a livedb instance.
 * - .db property (which is passed into the livedb constructor)
 */
function ShareServer(options) {
  if (!(this instanceof Livedb)) return new Livedb(options);

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

// For backwards compatibility with alpha-15
ShareServer.createClient = ShareServer;

/** A client has connected through the specified stream. Listen for messages.
 * Returns the useragent associated with the connected session.
 *
 * The optional second argument (req) is an initial request which is passed
 * through to any connect() middleware. This is useful for inspecting cookies
 * or an express session or whatever on the request object in your middleware.
 *
 * (The useragent is available through all middleware)
 */
ShareServer.prototype.listen = function(stream, req) {
  return session(this, stream, req).agent;
};

// Create and return REST middleware to access the documents
ShareServer.prototype.rest = function() {
  return rest(this);
};


/** Add middleware to an action. The action is optional (if not specified, the
 * middleware fires on every action).
 */
ShareServer.prototype.use = function(action, middleware) {
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
ShareServer.prototype.filter = function(fn) {
  this.docFilters.push(fn);
};

ShareServer.prototype.filterOps = function(fn) {
  this.opFilters.push(fn);
};

ShareServer.prototype.createAgent = function(stream) {
  return useragent(this, stream);
};

// Return truthy if the instance has registered middleware. Used for bulkSubscribe.
ShareServer.prototype._hasMiddleware = function(action) {
  return this.extensions[action];
};


/**
 * Passes request through the extensions stack
 *
 * Extensions may modify the request object. After all middlewares have been
 * invoked we call `callback` with `null` and the modified request.
 * If one of the extensions resturns an error the callback is called with that
 * error.
 */
ShareServer.prototype._trigger = function(request, callback) {
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

