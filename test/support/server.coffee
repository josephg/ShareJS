express = require 'express'
connect = require 'connect'
browserify = require 'browserify'
{Duplex} = require 'stream'

# Creates a sharejs instance with a livedb backend
createInstance = ->
  redis = require('redis').createClient()
  redis.flushdb()

  livedbLib = require 'livedb'
  memorydb  = livedbLib.memory()
  livedb    = livedbLib.client(db: memorydb, redis: redis)

  shareServer = require '../../lib/server'
  shareServer.createClient(backend: livedb)

# Converts a socket to a Duplex stream
socketToStream = (socket)->
  stream = new Duplex objectMode: yes
  socket.on 'message', (data)->
    console.log "<<< client receive"
    console.log data
    stream.push(data)
  stream._read = ->
  stream._write = (data)->
    console.log ">>> server send"
    console.log data
    socket.send(data)
  stream


# Exports an express app that handles sharejs and tests
module.exports = ->

  share = createInstance()

  # BrowserChannel middleware that creates sharejs sessions
  shareChannel = require('browserchannel').server (socket)->
    share.listen socketToStream(socket)


  express()
  .use(shareChannel)
  .use(connect.logger('dev'))
  .use(connect.static('test/client'))

  # Compile all client tests
  .get '/tests.js', (req, res)->
    res.type('js')
    browserify(extensions: ['.coffee'])
    .transform('coffeeify')
    .add('./test/client')
    .require('browserchannel/dist/bcsocket', expose: 'bcsocket')
    .require('./lib/client', expose: 'share')
    .require('assert')
    .bundle (error, source)->
      if error
        console.error error
        res.status 500
        res.end "console.error(#{JSON.stringify(error)}}"
      else
        res.end(source)
