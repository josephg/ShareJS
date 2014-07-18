exports.server = require('./server');
exports.client = require('./client');

// Type wrappers
// exports.types = require('./types');

exports.version = require('../package.json').version;

// Export the scripts directory to make it easy to host the scripts with
// express. Do something like this:
//  app.use('sharejs', express.static(sharejs.scriptsDir));
exports.scriptsDir = __dirname + '/../webclient';
