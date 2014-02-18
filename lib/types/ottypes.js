// By default json and text types are included in the client
var types = module.exports = {
  'json0': require('ottypes/lib/json0'),
  'http://sharejs.org/types/JSONv0': require('ottypes/lib/json0'),
  'text': require('ottypes/lib/text'),
  'http://sharejs.org/types/textv1': require('ottypes/lib/text')
}


// Copied from lodash.
function isObject(value) {
  return !!(value && objectTypes[typeof value])
}

// Allow the user to load additional ottypes.
if (isObject(global.ottypes)) {
    // Add all non existing types.
    for (var key in global.ottypes) {
        if (!types[key]) {
            types[key] = global.ottypes[key];
        }
    }
}
