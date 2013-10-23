express = require 'express'
connect = require 'connect'
browserify = require 'browserify'
{Duplex} = require 'stream'
SockStream = require '../../lib/server/adapters/sockjs'

# Creates a sharejs instance with a livedb backend
createInstance = ->
  redis = require('redis').createClient()
  redis.flushdb()

  livedbLib = require 'livedb'
  memorydb  = livedbLib.memory()
  livedb    = livedbLib.client(db: memorydb, redis: redis)

  shareServer = require '../../lib/server'
  shareServer.createClient(backend: livedb)


share = createInstance()

# SockJS connection
sockServer = require('sockjs').createServer sockjs_url: 'http://cdn.sockjs.org/sockjs-0.3.min.js'
sockServer.on 'connection', (conn) ->
  share.listen new SockStream conn, {debug: yes}

app = express()
.use(connect.logger('dev'))
.use(connect.static(__dirname))
.use(connect.static(__dirname + '/../../dist'))
.listen 3000, (error)->
  return console.error(error) if error
  console.log 'ShareJS with SockJS example is running on http://localhost:3000'

# Attach SockJS to the express server
sockServer.installHandlers app, prefix: '/sock'
