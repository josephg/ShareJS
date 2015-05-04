# This is a little prototype browserchannel wrapper for the session code.
{Duplex} = require 'stream'
browserChannel = require('browserchannel').server
connect = require 'connect'
serveStatic = require 'serve-static'
argv = require('optimist').argv
livedb = require 'livedb'

try
  require 'heapdump'

sharejs = require '../lib'

webserver = connect()

webserver.use serveStatic "#{__dirname}/public"
webserver.use serveStatic sharejs.scriptsDir

backend = livedb.client livedb.memory()

backend.addProjection '_users', 'users', 'json0', {x:true}

share = sharejs.server.createClient {backend}


###
share.use 'validate', (req, callback) ->
  err = 'noooo' if req.snapshot.data?.match /x/
  callback err

share.use 'connect', (req, callback) ->
  console.log req.agent
  callback()
###

numClients = 0

webserver.use browserChannel {webserver, sessionTimeoutInterval:5000}, (client) ->
  numClients++
  stream = new Duplex objectMode:yes
  stream._write = (chunk, encoding, callback) ->
    console.log 's->c ', JSON.stringify(chunk)
    if client.state isnt 'closed' # silently drop messages after the session is closed
      client.send chunk
    callback()

  stream._read = -> # Ignore. You can't control the information, man!

  stream.headers = client.headers
  stream.remoteAddress = stream.address

  client.on 'message', (data) ->
    console.log 'c->s ', JSON.stringify(data)
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
  share.listen stream

webserver.use '/doc', share.rest()

port = argv.p or 7007
webserver.listen port
console.log "Listening on http://localhost:#{port}/"
