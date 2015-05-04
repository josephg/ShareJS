// Entry point for the client
//
// Usage:
//
//    <script src="dist/share.js"></script>

exports.Connection = require('./connection').Connection;
exports.Doc = require('./doc').Doc;
require('./textarea');

var types = require('../types');
exports.ottypes = types.ottypes;
exports.registerType = types.registerType;
