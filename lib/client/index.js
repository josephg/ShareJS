// This is the entrypoint bundle for the browser bundle. It gets exported to
// window.sharejs.

exports.version = '0.8.0';

exports.Connection = require('./connection');
exports.Doc = require('./doc');

var t = require('./types');
exports.types = t.types;
exports.registerType = t.registerType;

// By default, include text, JSON and rich text.
t.registerType(require('ot-text'));
t.registerType(require('ot-json0'));
// Not published yet.
// registerType(require('ot-richtext'));

// This is a bit awful.
exports.Doc.prototype.attachTextarea = require('./textarea');

if (typeof window !== 'undefined' && !window.sharejs) {
  window.sharejs = exports;
}
