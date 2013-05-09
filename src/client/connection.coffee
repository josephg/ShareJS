# A Connection wraps a persistant BC connection to a sharejs server.
#
# This class implements the client side of the protocol defined here:
# https://github.com/josephg/ShareJS/wiki/Wire-Protocol
#
# The equivalent server code is in src/server/browserchannel.coffee.
#
# This file is a bit of a mess. I'm dreadfully sorry about that. It passes all the tests,
# so I have hope that its *correct* even if its not clean.
#
# Most of Connection exists to support the open() method, which creates a new document
# reference.

if WEB?
  types = exports.types
  {BCSocket, SockJS, WebSocket} = window
  if BCSocket
    socketImpl = 'channel'
  else
    if SockJS
      socketImpl = 'sockjs'
    else
      socketImpl = 'websocket'
else
  types = require '../types'
  {BCSocket} = require 'browserchannel'
  Doc = require('./doc').Doc
  WebSocket = require 'ws'
  socketImpl = null

class Connection
  constructor: (host, authentication) ->
    # Map of docname -> doc
    @docs = {}

    # States:
    # - 'connecting': The connection is being established
    # - 'handshaking': The connection has been established, but we don't have the auth ID yet
    # - 'ok': We have connected and recieved our client ID. Ready for data.
    # - 'disconnected': The connection is closed, but it will not reconnect automatically.
    # - 'stopped': The connection is closed, and will not reconnect.
    @state = 'connecting'

    unless socketImpl?
      if host.match /^ws:/ then socketImpl = 'websocket'

    @socket = switch socketImpl
      when 'channel' then new BCSocket(host, reconnect:true)
      when 'sockjs' then new ReconnectingWebSocket(host, SockJS)
      when 'websocket' then new ReconnectingWebSocket(host)
      else new BCSocket(host, reconnect:true)

    @socket.onmessage = (msg) =>
      msg = JSON.parse(msg.data) if socketImpl in ['sockjs', 'websocket']
      if msg.auth is null
        # Auth failed.
        @lastError = msg.error # 'forbidden'
        @disconnect()
        return @emit 'connect failed', msg.error
      else if msg.auth
        # Our very own client id.
        @id = msg.auth
        @setState 'ok'
        return

      docName = msg.doc

      if docName isnt undefined
        @lastReceivedDoc = docName
      else
        msg.doc = docName = @lastReceivedDoc

      if @docs[docName]
        @docs[docName]._onMessage msg
      else
        console?.error 'Unhandled message', msg

    @connected = false
    @socket.onclose = (reason) =>
      #console.warn 'onclose', reason
      @setState 'disconnected', reason
      if reason in ['Closed', 'Stopped by server']
        @setState 'stopped', @lastError or reason

    @socket.onerror = (e) =>
      #console?.warn 'onerror', e
      @emit 'error', e

    @socket.onopen = =>
      #console.warn 'onopen'

      # Send authentication message
      @send {
        auth: if authentication then authentication else null
      }

      @lastError = @lastReceivedDoc = @lastSentDoc = null
      @setState 'handshaking'

    @socket.onconnecting = =>
      #console.warn 'connecting'
      @setState 'connecting'

  setState: (state, data) ->
    #console.log "connection state #{@state} -> #{state}"
    return if @state is state
    @state = state

    delete @id if state is 'disconnected'
    @emit state, data

    # Documents could just subscribe to the state change events, but there's less state to
    # clean up when you close a document if I just notify the doucments directly.
    for docName, doc of @docs
      doc._connectionStateChanged state, data

  send: (data) ->
    if data.doc
      docName = data.doc
      if docName is @lastSentDoc
        delete data.doc
      else
        @lastSentDoc = docName

    #console.warn 'c->s', data
    data = JSON.stringify(data) if socketImpl in ['sockjs', 'websocket']
    @socket.send data

  disconnect: ->
    # This will call @socket.onclose(), which in turn will emit the 'disconnected' event.
    #console.warn 'calling close on the socket'
    @socket.close()

  # *** Doc management
 
  makeDoc: (name, data, callback) ->
    throw new Error("Doc #{name} already open") if @docs[name]
    doc = new Doc(@, name, data)
    @docs[name] = doc

    doc.open (error) =>
      delete @docs[name] if error
      unless error
        doc.on 'closed', =>
          delete @docs[name] unless doc.autoOpen
      callback error, (doc unless error)

  # Open a document that already exists
  # callback(error, doc)
  openExisting: (docName, callback) ->
    return callback 'connection closed' if @state is 'stopped'
    return @_ensureOpenState(@docs[docName], callback) if @docs[docName]
    doc = @makeDoc docName, {}, callback

  # Open a document. It will be created if it doesn't already exist.
  # Callback is passed a document or an error
  # type is either a type name (eg 'text' or 'simple') or the actual type object.
  # Types must be supported by the server.
  # callback(error, doc)
  open: (docName, type, callback) ->
    return callback 'connection closed' if @state is 'stopped'

    # Wait for the connection to open
    if @state is 'connecting'
      @on 'handshaking', ->
        @open(docName, type, callback)
        callback = null # When we reconnect, don't call the callback again.
      return

    if typeof type is 'function'
      callback = type
      type = 'text'

    callback ||= ->

    type = types[type] if typeof type is 'string'

    throw new Error "OT code for document type missing" unless type

    throw new Error 'Server-generated random doc names are not currently supported' unless docName?

    if @docs[docName]
      doc = @docs[docName]
      if doc.type == type
        @_ensureOpenState(doc, callback)
      else
        callback 'Type mismatch', doc
      return

    @makeDoc docName, {create:true, type:type.name}, callback

  _ensureOpenState: (doc, callback) ->
    switch doc.state
      when 'open' then callback null, doc
      when 'opening' then @on 'open', -> callback null, doc
      when 'closed' then doc.open (error) -> callback error, (doc unless error)
    return

# Not currently working.
#  create: (type, callback) ->
#    open null, type, callback

# Make connections event emitters.
unless WEB?
  MicroEvent = require './microevent'

MicroEvent.mixin Connection

exports.Connection = Connection
