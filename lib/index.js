exports.server = require('./server');
exports.client = require('./client');

// Type wrappers
exports.types = require('./types');

// Export the scripts directory to make it easy to host the scripts with connect. Do something like this:
//  app.use('sharejs', connect.static(sharejs.scriptsDir));
exports.scriptsDir = __dirname + '/../dist';

// Expose db.mongo, db.etc - whatever else is in livedb.
exports.db = require('livedb');
