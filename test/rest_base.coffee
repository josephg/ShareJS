# Tests for the REST-ful interface (base-option)

server = require '../src/server'
{fetch} = require './helpers'

module.exports =
  'rest-url changes when base path is set': (test) ->
    # Create a new server which just exposes the REST interface and a changed REST base-path
    options = {
      socketio: null
      browserChannel: null
      rest: {base:'/foo'}
      db: {type: 'none'}
    }

    try
      model = server.createModel options
      server = server options, model
      server.listen =>
        port = server.address().port
        console.log port
        # use the prefix given in base to access the doc and expect something that is
        # NOT "Cannot GET" which is connects standard error message.
        fetch 'GET', port, "/foo/doc/test", null, (res, data) ->
          console.log data
          test.notStrictEqual("Cannot GET", data[...10])
          server.close()
          test.done()
    catch e
      console.log e.stack
      throw e
