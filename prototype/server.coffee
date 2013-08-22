# This is a little prototype browserchannel wrapper for the session code.
{Duplex} = require 'stream'
browserChannel = require('browserchannel').server
connect = require 'connect'
argv = require('optimist').argv
livedb = require 'livedb'
livedbMongo = require 'livedb-mongo'

webserver = connect(
  #  connect.logger()
  connect.static "#{__dirname}/public"
  connect.static "#{__dirname}/../webclient"
)

sharejs = require '../lib'

#backend = livedb.client livedb.memory()
backend = livedb.client livedbMongo('localhost:27017/test?auto_reconnect', safe:false)
share = sharejs.server.createClient {backend}


###
share.use 'validate', (req, callback) ->
  err = 'noooo' if req.snapshot.data?.match /x/
  callback err

share.use 'connect', (req, callback) ->
  console.log req.agent
  callback()
###

opts = {webserver}
webserver.use browserChannel opts, (client) ->
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
    stream.emit 'close'
    stream.emit 'end'
    stream.end()

  # ... and give the stream to ShareJS.
  share.listen stream

webserver.use '/doc', share.rest()

port = argv.p or 7007
webserver.listen port
console.log "Listening on http://localhost:#{port}/"
