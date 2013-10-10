var connect = require('connect');


module.exports = function(grunt) {
  grunt.registerTask('testserver', 'Start a server to test clients', function(){
    var done = this.async();
    server = require('./test/support/server')();
    server.listen(3000)
      .on('listening', function() {
        grunt.log.writeln('To test clients go to http://localhost:3000');
      })
      .on('error', function(err) {
        if (err.code === 'EADDRINUSE') {
          grunt.fatal('Port 3000 is already in use by another process.');
        } else {
          grunt.fatal(err);
        }
      });
  });
};
