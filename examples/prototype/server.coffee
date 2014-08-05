# This is a little prototype browserchannel wrapper for the session code.
{Duplex} = require 'stream'
browserChannel = require('browserchannel').server
express = require 'express'
argv = require('optimist').argv
livedb = require 'livedb'
livedb.ot.registerType require('quillot').type

try
  require 'heapdump'

sharejs = require '../lib'

app = express()

app.use express.static "#{__dirname}/public"
  #  express.logger()
app.use express.static sharejs.scriptsDir
webserver = require('http').createServer app

#livedbMongo = require 'livedb-mongo'
#backend = livedb.client livedbMongo('localhost:27017/test?auto_reconnect', safe:false)
backend = livedb.client livedb.memory()
backend.addProjection '_users', 'users', 'json0', {x:true}


clientView = require('livedb-middleware') backend


###
clientView.use (req) ->
  console.log "middleware #{req.action}"


clientView.use 'connect', (req, next) ->
  console.log 'connect middleware'
  next()
clientView.use 'validate', (req, next) ->
  err = 'noooo' if req.snapshot.data?.match /x/
  next err
###

share = sharejs.server {backend: clientView}

numClients = 0

app.use browserChannel {webserver, sessionTimeoutInterval:5000}, (client, initialReq) ->
  numClients++
  stream = new Duplex objectMode:yes
  stream._write = (chunk, encoding, callback) ->
    console.log 's->c ', chunk
    if client.state isnt 'closed' # silently drop messages after the session is closed
      client.send chunk
    callback()

  stream._read = -> # Ignore. You can't control the information, man!

  stream.headers = client.headers
  stream.remoteAddress = stream.address

  client.on 'message', (data) ->
    console.log 'c->s ', data
    stream.push data

  stream.on 'error', (msg) ->
    client.stop()

  client.on 'close', (reason) ->
    stream.push null
    stream.emit 'close'

    numClients--
    console.log 'client went away', numClients

  stream.on 'end', ->
    client.close()

  # ... and give the stream to ShareJS.
  share.listen stream, initialReq

#webserver.use '/doc', share.rest()

port = argv.p or 7007
webserver.listen port
console.log "Listening on http://localhost:#{port}/"
