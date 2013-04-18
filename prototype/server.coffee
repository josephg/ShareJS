# This is a little prototype browserchannel wrapper for the session code.
{Duplex} = require 'stream'
browserChannel = require('browserchannel').server
connect = require 'connect'
argv = require('optimist').argv

webserver = connect(
  #  connect.logger()
  connect.static "#{__dirname}/public"
  connect.static "#{__dirname}/../webclient"
)

sharejs = require '../src'
shareClient = sharejs.server.createClient db:sharejs.db.mongo 'localhost:27017/test?auto_reconnect', safe:false

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

  # ... and give the stream to ShareJS.
  shareClient.listen stream

port = argv.p or 7007
webserver.listen port
console.log "Listening on http://localhost:#{port}/"
