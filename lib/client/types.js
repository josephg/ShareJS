// This module exports a container for bundling OT types, and a custom
// registration function. ShareJS bundles text, json and richtext by default -
// these are bundled in index.js.
var types = exports.types = {};

exports.registerType = registerType;
function registerType(type) {
  if (type.type) type = type.type;

  if (type.name) types[type.name] = type;
  if (type.uri) types[type.uri] = type;
};
