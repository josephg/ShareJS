# This implements the WebSocket network API for ShareJS.
EventEmitter = require('events').EventEmitter
WebSocketServer = require('ws').Server

sessionHandler = require('./session').handler

wrapSession = (conn) ->
  wrapper = new EventEmitter
  wrapper.abort = -> conn.close()
  wrapper.stop = -> conn.close()
  wrapper.send = (response) ->
    conn.send JSON.stringify response if wrapper.ready()
  wrapper.ready = -> conn.readyState is 1
  conn.on 'message', (data) -> wrapper.emit 'message', JSON.parse data
  wrapper.headers = conn.upgradeReq.headers
  # TODO - I don't think this is the right way to get the address
  wrapper.address = conn._socket.server._connectionKey?
  wrapper

exports.attach = (server, createAgent, options) ->
  options.prefix or= '/websocket'
  wss = new WebSocketServer {server: server, path: options.prefix}
  wss.on 'connection', (conn) -> sessionHandler wrapSession(conn), createAgent
