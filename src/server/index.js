var session = require('./session');
var livedb = require('livedb');

exports.createClient = function(options) {
  if (!options) options = {};

  if (!options.backend) {
    options.backend = livedb.client(options.db);
  }

  return {
    listen: function(stream) {
      session(options, stream);
    },

  };
};

