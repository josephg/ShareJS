# This is a little prototype browserchannel wrapper for the session code.
{Duplex} = require 'stream'
connect = require 'connect'
argv = require('optimist').argv
livedb = require 'livedb'
http = require 'http'

sharejs = require '../lib'

app = connect(
  #  connect.logger()
  connect.static "#{__dirname}/public"
  connect.static sharejs.scriptsDir
)


# app.use '/doc', share.rest()

backend = livedb.client livedb.memory()
#backend = livedb.client livedbMongo('localhost:27017/test?auto_reconnect', safe:false)

share = sharejs.server.createClient {backend}


server = http.createServer app

WebSocketServer = require('ws').Server
wss = new WebSocketServer {server}
wss.on 'connection', (client) ->
  stream = new Duplex objectMode:yes
  stream._write = (chunk, encoding, callback) ->
    console.log 's->c ', chunk
    client.send JSON.stringify chunk
    callback()

  stream._read = -> # Ignore. You can't control the information, man!

  stream.headers = client.upgradeReq.headers
  stream.remoteAddress = client.upgradeReq.connection.remoteAddress

  client.on 'message', (data) ->
    console.log 'c->s ', data
    stream.push JSON.parse data

  stream.on 'error', (msg) ->
    client.close msg

  client.on 'close', (reason) ->
    stream.push null
    stream.emit 'close'

    console.log 'client went away'
    client.close reason

  stream.on 'end', ->
    client.close()

  # ... and give the stream to ShareJS.
  share.listen stream



port = argv.p or 7007
server.listen port
console.log "Listening on http://localhost:#{port}/"
