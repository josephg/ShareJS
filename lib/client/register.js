var types;
if (typeof require !== "undefined") {
  types = require('ottypes');
} else {
  types = window.ottypes;
}

exports.registerType = function(type) {
  if (type.name) types[type.name] = type;
  if (type.uri) types[type.uri] = type;
};