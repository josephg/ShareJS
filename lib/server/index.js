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

// Make a client Connection object which 'connects' to this server directly
ShareServer.prototype.localConnection = function() {
  // This probably doesn't work yet.
  var Duplex = require('stream').Duplex;

  var stream = new Duplex({objectMode: true});
  var socket = {
    // OPEN
    readyState: 1,

    send: function(message) {
      stream.push(message);
    },

    close: function(event) {
      this.readyState = 3;
      this.onclose && this.onclose(event);
      stream.close();
    }
  };

  stream._read = function() {};
  stream._write = function(chunk, encoding, callback) {
    socket.onmessage({data: chunk});
    callback();
  };

  this.listen(stream);
  return new require('../client').Connection(socket);
};

