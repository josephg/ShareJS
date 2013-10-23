express = require 'express'
connect = require 'connect'
browserify = require 'browserify'
{Duplex} = require 'stream'
{BCStream} = require('../../lib').adapters

# Creates a sharejs instance with a livedb backend
createInstance = ->
  livedbLib = require 'livedb'
  memorydb  = livedbLib.memory()
  livedb    = livedbLib.client(memorydb)

  shareServer = require '../../lib/server'
  shareServer.createClient(backend: livedb)

share = createInstance()

# BrowserChannel middleware that creates sharejs sessions
shareChannel = require('browserchannel').server (socket)->
  share.listen new BCStream(socket, {debug: yes})

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
