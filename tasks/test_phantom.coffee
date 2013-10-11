path = require('path')

module.exports = (grunt)->

  grunt.registerTask 'test:phantom', 'Run browser tests in phantom', ->

    server = require('../test/helpers/server')(log: false)
      .disable('log')
      .listen(3456)

    done = this.async()

    phantomProxy = require('phantom-proxy')
    url = 'http://127.0.0.1:3456'
    phantomProxy.create (proxy)->

      fail = (msg)->
        proxy.end ->
          grunt.fail.fatal(msg)
          done()

      page = proxy.page
      page.open url, (status)->
        if status != true
          fail "Could not connect to #{url}"

      page.on 'error', (error, trace)->
        if trace && trace.length
          grunt.log.error(error.red + ' at ')
          trace.forEach (line)->
            file = line.file.replace(/^file:/,'')
            message = grunt.util._('%s:%d %s')
              .sprintf(path.relative('.',file), line.line, line.function)
            grunt.log.error(message.red)
        else
          grunt.log.error(error.red)
        fail('Errors on site')

      page.on 'callback', (args)->
        page.emit(args...)

      page.on 'console', console.log.bind(console.log)
      page.on 'write', process.stdout.write.bind(process.stdout)
      page.on 'finished', (failures)->
        if failures > 0
          fail("#{failures} test(s) failed")
        else
          proxy.end(done)

