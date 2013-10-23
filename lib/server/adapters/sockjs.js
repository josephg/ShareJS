// SockJS Adapter
// --------------
//
// Usage:
//   var sockServer = sockjs.createServer();
//   sockServer.on('connection', function (conn) {
//     shareServer.listen(new SockStream(conn));
//   });
//


var Duplex = require('stream').Duplex;
var util = require('util');

// Takes a connection object from SockJS and transforms
// it into a duplex stream usable by ShareJS.
var SockStream = module.exports = function(connection, options) {
  // Instantiate even when used without new
  if (!this instanceof SockStream) return new SockStream(connection, options);

  // Check for connection object
  if (connection == null) throw new Error('No connection object provided.');

  options = options || {};

  // Initialize
  Duplex.call(this, {objectMode: true});

  // Debug?
  this.debug = options.debug;

  // The SockJS connection
  this.connection = connection;

  // The internal buffer
  this.buffer = [];

  // Current state of the connection
  // Either  0-connecting, 1-open, 2-closing, 3-closed.
  this.readyState = this.connection.readyState;

  this.connection.on('data', this._pushToBuffer.bind(this));

  // Close the stream when the connection is closed
  this.connection.on('close', this.push.bind(this, null));
};

// Inherit from Duplex
util.inherits(SockStream, Duplex);

// Parse the incoming data and push it into the internal buffer.
SockStream.prototype._pushToBuffer = function (data) {
  data = JSON.parse(data);

  if (this.debug) {
    console.log('<<< client receive');
    console.log(data);
  }

  this.buffer.push(data);
}

// _read method
SockStream.prototype._read = function readBytes(n) {
  var self = this;

  while (this.buffer.length) {
    var chunk = this.buffer.shift();
    if (!this.push(chunk)) {
      // False from push, stop reading
      break;
    }
  }

  if (self.readyState === 3) {
    // We are done, push null to end stream
    self.push(null);
  } else {
    // Otherwise try again in 100ms
    setTimeout(readBytes.bind(self, 100, n));
  }
};

// _write method
SockStream.prototype._write = function (chunk, enc, cb) {
  if (this.debug) {
    console.log('>>> server send');
    console.log(chunk);
  }

  this.connection.write(JSON.stringify(chunk));
  cb();
};


