express = require 'express'
connect = require 'connect'
{Duplex} = require 'stream'
{BCStream} = require('../../lib').adapters

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



# Exports an express app that handles sharejs and tests
#
# @param options.log  enables logging of wire protocol and server requests,
#   defaults to true
module.exports = (options = {})->

  log = true
  log = options.log if options.log?

  share = createInstance()

  # BrowserChannel middleware that creates sharejs sessions
  shareChannel = require('browserchannel')
  .server cors: '*', (socket)->
    share.listen new BCStream(socket, {debug: log})

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

  app
