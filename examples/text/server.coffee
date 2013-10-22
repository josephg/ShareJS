express = require 'express'
connect = require 'connect'
browserify = require 'browserify'
{Duplex} = require 'stream'

# Creates a sharejs instance with a livedb backend
createInstance = ->
  livedbLib = require 'livedb'
  memorydb  = livedbLib.memory()
  livedb    = livedbLib.client(memorydb)

  shareServer = require '../../lib/server'
  shareServer.createClient(backend: livedb)


# Converts a socket to a Duplex stream
socketToStream = (socket)->
  stream = new Duplex objectMode: yes
  socket.on 'message', (data)->
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
    socket.send(data)
    callback()
  stream



share = createInstance()

# BrowserChannel middleware that creates sharejs sessions
shareChannel = require('browserchannel').server (socket)->
  share.listen socketToStream(socket)

app = express()
.use(shareChannel)
.use(connect.logger('dev'))
.use(connect.static(__dirname))
.use(connect.static(__dirname + '/../../dist'))
.listen 3000, (error)->
  if error
    console.error(error)
  else
    console.log 'ShareJS text examples running on http://localhost:3000'
