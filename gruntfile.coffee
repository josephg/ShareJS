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
        tasks: ['test:server']

    uglify:
      dist:
        files: {'dist/share.min.js': 'dist/share.js'}


  # Load NPM Tasks
  grunt.loadNpmTasks 'grunt-karma'
  grunt.loadNpmTasks 'grunt-simple-mocha'
  grunt.loadNpmTasks 'grunt-contrib-watch'
  grunt.loadNpmTasks 'grunt-contrib-uglify'

  # Register Test Tasks
  grunt.registerTask 'test:browser', ['server', 'karma:ci']
  grunt.registerTask 'test:server', ['simplemocha:server']
  grunt.registerTask 'test', ['test:server', 'test:browser']

  grunt.registerTask 'server', 'Start a server to test clients', ->
    done = this.async()
    server = require('./test/helpers/server')(
      log:  !!grunt.cli.options.debug
      dist: !!grunt.cli.options.dist
    ).listen(3000)
    .on('listening', done)
    .on 'error', (err) ->
      if (err.code is 'EADDRINUSE')
        grunt.fatal('Port 3000 is already in use by another process.')
      else
        grunt.fatal(err)


  # Registers Dist Tasks 
  grunt.registerTask 'dist', ['dist:build', 'uglify:dist']

  grunt.registerTask 'dist:build', 'Compile the client distribution', ->
    fs = require('fs')
    done = this.async()
    require('browserify')()
      .require('ottypes', {expose: 'ottypes'})
      .require('./lib/client', {expose: 'share'})
      .add('./lib/types')
      .bundle (error, source)->
        return grunt.fail.fatal(error) if error
        fs.mkdirSync('dist') if !fs.existsSync('dist')
        fs.writeFile('dist/share.js', source, done)

  # Default Task
  grunt.registerTask 'default', ['server', 'karma:dev:start', 'watch']


