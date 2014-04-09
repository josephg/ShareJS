// Entry point for the client
//
// Usage:
//
//    <script src="dist/share.js"></script>


// Load api for ottypes
require('../types');

exports.Connection = require('./connection').Connection;
exports.Doc = require('./doc').Doc;
exports.version = require('../../package.json').version;
