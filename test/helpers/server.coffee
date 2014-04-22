express = require 'express'
connect = require 'connect'
{Duplex} = require 'stream'

# Creates a sharejs instance with a livedb backend
createInstance = ->
  redis = require('redis').createClient()
  redis.flushdb()

  livedbLib = require 'livedb'
  memorydb  = livedbLib.memory()
  livedb    = livedbLib.client(db: memorydb, redis: redis)
  livedb.redis = redis
  livedb.db = memorydb

  shareServer = require '../../lib/server'
  shareServer.createClient(backend: livedb)


# Converts a socket to a Duplex stream
socketToStream = (socket, log = true)->
  stream = new Duplex objectMode: yes
  socket.on 'message', (data)->
    if log
      console.log "<<< client receive"
      console.log data
    stream.push(data)
  socket.on 'close', ->
    stream.end()
    stream.emit('close')
    stream.emit('end')

  stream._read = ->
  stream._write = (data, enc, callback)->
    if log
      console.log ">>> server send"
      console.log data
    socket.send(data)
    callback()
  stream



# Exports an express app that handles sharejs and tests
#
# @param options.log  enables logging of wire protocol and server requests,
#   defaults to true
module.exports = (options = {})->

  log = no
  log = options.log if options.log?

  share = createInstance()

  # BrowserChannel middleware that creates sharejs sessions
  shareChannel = require('browserchannel')
  .server cors: '*', (socket)->
    share.listen socketToStream(socket, log)

  # Enables client to reset the database
  fixturesChannel = require('browserchannel')
  .server base: '/fixtures', cors: '*', (socket)->
    socket.on 'message', (data)->
      share.backend.redis.flushdb()
      share.backend.db.collections = {}
      share.backend.db.ops = {}
      console.log '*** reset' if log
      socket.send 'ok'


  app = express()
  .use(shareChannel)
  .use(fixturesChannel)

  app.use(connect.logger('dev')) if log

  app.listen 3000
