var session = require('./session');
var livedb = require('livedb');

module.exports = ShareServer;

/* This encapsulates the sharejs server state & exposes a few useful methods.
 *
 * options is an object with one of:
 * - .backend property, which is a livedb instance.
 * - .db property (which is passed into the livedb constructor)
 */
function ShareServer(options) {
  if (!(this instanceof ShareServer)) return new ShareServer(options);

  this.options = options;

  if (options.backend) {
    this.backend = options.backend;
  } else if (options.db) {
    this.backend = livedb.client(options.db);
  } else {
    throw Error("Both options.backend and options.db are missing. Can't function without a database!");
  }
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
ShareServer.prototype.listen = function(stream, initialReq) {
  return session(this.backend, stream, initialReq).agent;
};

