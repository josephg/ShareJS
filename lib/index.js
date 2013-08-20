exports.server = require('./server');
exports.client = require('./client');

// Type wrappers
exports.types = require('./types');

exports.version = '0.7.0-alpha8';

// Expose db.mongo, db.etc - whatever else is in livedb.
exports.db = require('livedb');
