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
  socket.on 'data', (data)->
    data = JSON.parse data
    console.log "<<< client receive"
    console.log data
    stream.push(data)
  socket.on 'close', ->
    stream.end()
    stream.emit('close')
    stream.emit('end')

  stream._read = ->
  stream._write = (data, enc, callback)->
    console.log ">>> server send"
    console.log data
    socket.write(JSON.stringify data)
    callback()
  stream



share = createInstance()

# SockJS connection
sockServer = require('sockjs').createServer sockjs_url: 'http://cdn.sockjs.org/sockjs-0.3.min.js'
sockServer.on 'connection', (socket) ->
  share.listen socketToStream socket

app = express()
.use(connect.logger('dev'))
.use(connect.static(__dirname))
.use(connect.static(__dirname + '/../../dist'))
.listen 3000, (error)->
  if error
    console.error(error)
  else
    console.log 'ShareJS text examples running on http://localhost:3000'

# Attach SockJS to the express server
sockServer.installHandlers app, prefix: '/sock'
