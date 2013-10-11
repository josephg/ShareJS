var connect = require('connect');

module.exports = function(grunt) {
  grunt.initConfig({
    simplemocha: {
      options: {
        ignoreLeaks: true,
        ui: 'bdd',
        reporter: 'spec'
      },
      all: [
        'test/**/*_spec.coffee',
        'test/**/*_spec.js'
      ]
    }
  });

  grunt.loadTasks('tasks');
  grunt.loadNpmTasks('grunt-simple-mocha');

  grunt.registerTask('test', ['simplemocha']);

  grunt.registerTask('test:server', 'Start a server to test clients', function(){
    var done = this.async();
    server = require('./test/helpers/server')();
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
