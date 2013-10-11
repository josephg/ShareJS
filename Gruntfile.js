module.exports = function(grunt) {
  grunt.loadTasks('tasks');

  grunt.registerTask('test:specs', function() {
    grunt.util.spawn({
      cmd: 'node_modules/.bin/mocha',
      opts: { stdio: 'inherit' }
    }, this.async());
  })

  grunt.registerTask('test', ['test:specs']);

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
