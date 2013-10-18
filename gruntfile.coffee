module.exports = (grunt) ->
  grunt.initConfig
    karma:
      options:
        configFile: 'karma.conf.coffee'
        runnerPort: 9999
        port: 9998
      ci:
        singleRun: true
        reporters: ['dots']
      dev:
        background: true

    simplemocha:
      options:
        ui: 'bdd',
        reporter: 'dot',
        ignoreLeaks: false
      server:
        src: ['test/server/*.coffee']
    watch:
      karma:
        files: [
          'lib/**/*.js'
          'test/browser/*.coffee'
          'test/helpers/*.coffee'
        ]
        tasks: ['karma:dev:run']
      mocha:
        files: [
          'lib/**/*.js'
          'test/server/*.coffee'
          'test/helpers/*.coffee'
        ]

  # Load NPM Tasks
  grunt.loadNpmTasks 'grunt-karma'
  grunt.loadNpmTasks 'grunt-simple-mocha'
  grunt.loadNpmTasks 'grunt-contrib-watch'

  # Register Tasks
  grunt.registerTask 'test:browser', ['server', 'karma:ci']
  grunt.registerTask 'test:server', ['simplemocha:server']
  grunt.registerTask 'test', ['test:server', 'test:browser']

  grunt.registerTask 'server', 'Start a server to test clients', ->
    done = this.async()
    server = require('./test/helpers/server')({log: !!grunt.cli.options.debug})
    server.listen(3000)
    .on('listening', done)
    .on 'error', (err) ->
      if (err.code is 'EADDRINUSE')
        grunt.fatal('Port 3000 is already in use by another process.')
      else
        grunt.fatal(err)

  # Default Task
  grunt.registerTask 'default', ['server', 'karma:dev:start', 'watch']


