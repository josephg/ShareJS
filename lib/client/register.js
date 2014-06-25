exports.registerType = function(type) {
  var ottypes = require('ottypes');
  if (type.name) ottypes[type.name] = type;
  if (type.uri) ottypes[type.uri] = type;
};