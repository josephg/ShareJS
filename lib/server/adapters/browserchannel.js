// Browserchannel Adapter
// ----------------------
//
// Usage:
//   var bcServer = browserchannel.server(function (conn) {
//     shareServer.listen(new BCStream(conn));
//   });
//


var Duplex = require('stream').Duplex;
var util = require('util');

// Takes a connection object from browserchannel and transforms
// it into a duplex stream usable by ShareJS.
var BCStream = module.exports = function(connection, options) {
  // Instantiate even when used without new
  if (!this instanceof BCStream) return new BCStream(connection, options);

  // Check for connection object
  if (connection == null) throw new Error('No connection object provided.');

  options = options || {};

  // Initialize
  Duplex.call(this, {objectMode: true});

  // Debug?
  this.debug = options.debug;

  // The browserchannel connection
  this.connection = connection;

  // The internal buffer
  this.buffer = [];

  // Current readyState of the connection
  // Either  init, ok, closed
  this.readyState = this.connection.state;

  this.connection.on('message', this._pushToBuffer.bind(this));

  // Close the stream when the connection is closed
  this.connection.on('close', this.push.bind(this, null));
};

// Inherit from Duplex
util.inherits(BCStream, Duplex);

// Parse the incoming data and push it into the internal buffer.
BCStream.prototype._pushToBuffer = function (data) {
  data = JSON.parse(data);

  if (this.debug) {
    console.log('<<< client receive');
    console.log(data);
  }

  this.buffer.push(data);
}

// _read method
BCStream.prototype._read = function readBytes(n) {
  var self = this;

  while (this.buffer.length) {
    var chunk = this.buffer.shift();
    if (!this.push(chunk)) {
      // False from push, stop reading
      break;
    }
  }

  if (self.readyState === 'closed') {
    // We are done, push null to end stream
    self.push(null);
  } else {
    // Otherwise try again in 100ms
    setTimeout(readBytes.bind(self, 100, n));
  }
};

// _write method
BCStream.prototype._write = function (chunk, enc, cb) {
  if (this.debug) {
    console.log('>>> server send');
    console.log(chunk);
  }

  this.connection.send({data: JSON.stringify(chunk)});
  cb();
};


