# This implements the WebSocket network API for ShareJS.
EventEmitter = require('events').EventEmitter
WebSocketServer = require('ws').Server
dateutil    = require 'dateutil'

sessionHandler = require('./session').handler

wrapSession = (conn, options) ->
  wrapper = new EventEmitter
  wrapper.abort = -> conn.close()
  wrapper.stop = -> conn.close()
  wrapper.send = (response) ->
    conn.send JSON.stringify response if wrapper.ready()
  wrapper.ready = -> conn.readyState is 1
  conn.on 'message', (data) ->
    try
      parsed = JSON.parse data
      wrapper.emit 'message', parsed

      if options.shareJSLog?
        now = new Date()
        options.shareJSLog.write("\n#{dateutil.format(now, 'Y-m-d H:i:s')}: Received: #{parsed}")

    catch error
      console.log "Received data parsing error #{error}"

  wrapper.headers = conn.upgradeReq.headers
  # TODO - I don't think this is the right way to get the address
  wrapper.address = conn._socket.server._connectionKey?
  wrapper

exports.attach = (server, createAgent, options) ->
  options.prefix or= '/websocket'
  wss = new WebSocketServer {server: server, path: options.prefix}
  wss.on 'connection', (conn) -> sessionHandler wrapSession(conn, options), createAgent
