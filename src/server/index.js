var session = require('./session');
var livedb = require('livedb');

exports.createClient = function(options) {
  if (!options) options = {};

  return {
    listen: function(stream) {
      session(options, stream);
    },

  };
};

