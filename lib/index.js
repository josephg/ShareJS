exports.server = require('./server');
exports.client = require('./client');

// Type wrappers
exports.types = require('./types');

exports.version = require('../package.json').version;

// Expose db.mongo, db.etc - whatever else is in livedb.
exports.db = require('livedb');
