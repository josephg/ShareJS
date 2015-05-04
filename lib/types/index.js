
exports.ottypes = {};
exports.registerType = function(type) {
  if (type.name) exports.ottypes[type.name] = type;
  if (type.uri) exports.ottypes[type.uri] = type;
};

exports.registerType(require('ot-json0').type);
exports.registerType(require('ot-text').type);
exports.registerType(require('ot-text-tp2').type);

// The types register themselves on their respective types.
require('./text-api');
require('./text-tp2-api');

// The JSON API is buggy!! Please submit a pull request fixing it if you want to use it.
//require('./json-api');
