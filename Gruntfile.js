module.exports = function(grunt) {
  grunt.initConfig({
    karma: {
      browser: {
        configFile: 'karma.conf.js'
      }
    },
    simplemocha: {
      options: {
        ui: 'bdd',
        reporter: 'spec',
        ignoreLeaks: false
      },
      server: {
        src: ['test/server/*.coffee']
      }
    }
  });

  // Load NPM Tasks
  grunt.loadNpmTasks('grunt-karma');
  grunt.loadNpmTasks('grunt-simple-mocha');


  // Register Tasks
  grunt.registerTask('test-browser', ['test:server', 'karma:browser']);
  grunt.registerTask('test-server', ['simplemocha:server']);

  grunt.registerTask('test:server', 'Start a server to test clients', function(){
    var done = this.async();
    server = require('./test/helpers/server')({log: false});
    server.listen(3000)
    .on('listening', function() {
      grunt.log.writeln('To test clients go to http://localhost:3000');
      done();
    })
    .on('error', function(err) {
      if (err.code === 'EADDRINUSE') {
        grunt.fatal('Port 3000 is already in use by another process.');
      } else {
        grunt.fatal(err);
      }
    });
  });

  // Default Task
  grunt.registerTask('default', ['test-server', 'test-browser']);
};
