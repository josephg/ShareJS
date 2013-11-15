// This is a little prototype browserchannel wrapper for the session code.

var Duplex = require('stream').Duplex;
var browserChannel = require('browserchannel').server;
var connect = require('connect');
var argv = require('optimist').argv;
var livedb = require('livedb');
var livedbMongo = require('livedb-mongo');
var path = require('path');
var browserify = require('connect-browserify');
var sharejs = require('../lib');

var webserver = connect(
  // connect.logger(),
  connect['static']('' + __dirname + '/public')
);

webserver.use('/share.js', browserify.serve({
  entry: '../lib/client',
  standalone: 'sharejs'
}));

webserver.use('/textarea.js', browserify.serve({
  entry: '../lib/client/textarea'
}));

var backend = livedb.client(livedbMongo('localhost:27017/test?auto_reconnect', {
  safe: false
}));

var share = sharejs.server.createClient({
  backend: backend
});

/*
 * share.use 'validate', (req, callback) ->
 *   err = 'noooo' if req.snapshot.data?.match /x/
 *   callback err
 *
 * share.use 'connect', (req, callback) ->
 *   console.log req.agent
 *    callback()
 */


webserver.use(browserChannel({
  webserver: webserver
}, function(client) {
  var stream;
  stream = new Duplex({
    objectMode: true
  });
  stream._write = function(chunk, encoding, callback) {
    console.log('s->c ', chunk);
    if (client.state !== 'closed') {
      client.send(chunk);
    }
    return callback();
  };
  stream._read = function() {};
  stream.headers = client.headers;
  stream.remoteAddress = stream.address;
  client.on('message', function(data) {
    console.log('c->s ', data);
    return stream.push(data);
  });
  stream.on('error', function(msg) {
    return client.stop();
  });
  client.on('close', function(reason) {
    stream.emit('close');
    stream.emit('end');
    return stream.end();
  });
  return share.listen(stream);
}));

webserver.use('/doc', share.rest());

var port = argv.p || 7007;

webserver.listen(port);

console.log('Listening on http://localhost:' + port + '/');
