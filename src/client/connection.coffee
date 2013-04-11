# A Connection wraps a persistant BC connection to a sharejs server.
#
# This class implements the client side of the protocol defined here:
# https://github.com/josephg/ShareJS/wiki/Wire-Protocol
#
# The equivalent server code is in src/server/channel.coffee.
#
# This file is a bit of a mess. I'm dreadfully sorry about that. It passes all the tests,
# so I have hope that its *correct* even if its not clean.
#
# Most of Connection exists to support the open() method, which creates a new document
# reference.
#
# To make a connection, use:
#  new sharejs.Connection(socket)
#
# The socket should look like a websocket connection. It should have the following properties:
#  send(msg): Send the given message. msg may be an object - if so, you might need to JSON.stringify it.
#  close(): Disconnect the session
#
#  onmessage = function(msg){}: Event handler which is called whenever a message is received. The message
#     passed in should already be an object. (It may need to be JSON.parsed)
#  onclose
#  onerror
#  onopen
#  onconnecting
#
# The socket should probably automatically reconnect. If so, it should emit the appropriate events as it
# disconnects & reconnects. (onclose(), onconnecting(), onopen()).

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
  _get: (c, doc) -> @collections[c]?[doc]

  constructor: (@socket, authentication) ->
    # Map of collection -> docname -> doc
    @collections = {}

    # States:
    # - 'connecting': The connection is being established
    # - 'handshaking': The connection has been established, but we don't have the auth ID yet
    # - 'ok': We have connected and recieved our client ID. Ready for data.
    # - 'disconnected': The connection is closed, but it will not reconnect automatically.
    # - 'stopped': The connection is closed, and will not reconnect.
    @state = 'connecting'

    @socket.onmessage = (msg) =>
      console.log 'onmessage', msg
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

      if msg.doc isnt undefined
        mungedDocName = msg.doc

        parts = mungedDocName.split '.'
        collection = parts.shift()
        docName = parts.join '.'
        msg.c = @lastReceivedCollection = collection
        msg.doc = @lastReceivedDoc = docName
      else
        msg.c = collection = @lastReceivedCollection
        msg.doc = docName = @lastReceivedDoc

      if (doc = @_get collection, docName)
        doc._onMessage msg
      else
        console?.error 'Unhandled message', msg

    @connected = false
    @socket.onclose = (reason) =>
      #console.warn 'onclose', reason
      @setState 'disconnected', reason
      if reason in ['Closed', 'Stopped by server']
        @setState 'stopped', @lastError or reason

    @socket.onerror = (e) =>
      #console.warn 'onerror', e
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
    return if @state is state
    @state = state

    delete @id if state is 'disconnected'
    @emit state, data

    # Documents could just subscribe to the state change events, but there's less state to
    # clean up when you close a document if I just notify the doucments directly.
    for c, collection of @collections
      for docName, doc of collection
        doc._connectionStateChanged state, data

  send: (data) ->
    console.log "send:", data
    if data.doc # data.doc not set when sending auth request
      docName = data.doc
      collection = data.c

      if collection is @lastSentCollection and docName is @lastSentDoc
        delete data.c
        delete data.doc
      else
        @lastSentCollection = collection
        @lastSentDoc = docName

        # Munge doc name into one field
        data.doc = "#{collection}.#{docName}"
        delete data.c

    #console.warn 'c->s', data
    data = JSON.stringify(data) if socketImpl in ['sockjs', 'websocket']
    @socket.send data

  disconnect: ->
    # This will call @socket.onclose(), which in turn will emit the 'disconnected' event.
    #console.warn 'calling close on the socket'
    @socket.close()

  # *** Doc management
 
  makeDoc: (collection, name, data, callback) ->
    throw new Error("Doc #{name} already open") if @_get collection, name
    doc = new Doc(@, collection, name, data)
    c = (@collections[collection] ||= {})
    c[name] = doc

    doc.open (error) =>
      if error
        delete c[name]
      else
        doc.on 'closed', => delete c[name]

      callback error, (doc unless error)

  # Open a document that already exists
  # callback(error, doc)
  openExisting: (collection, docName, callback) ->
    return callback 'connection closed' if @state is 'stopped'
    doc = @_get collection, docName
    return @_ensureOpenState(doc, callback) if doc
    doc = @makeDoc collection, docName, {}, callback

  # Open a document. It will be created if it doesn't already exist.
  # Callback is passed a document or an error
  # type is either a type name (eg 'text' or 'simple') or the actual type object.
  # Types must be supported by the server.
  # callback(error, doc)
  open: (collection, docName, type, callback) ->
    return callback 'connection closed' if @state is 'stopped'

    # Wait for the connection to open
    if @state is 'connecting'
      @on 'handshaking', -> @open(collection, docName, type, callback)
      return

    if typeof type is 'function'
      callback = type
      type = 'text'

    callback ||= ->

    type = types[type] if typeof type is 'string'

    throw new Error "OT code for document type missing" unless type

    throw new Error 'Server-generated random doc names are not currently supported' unless docName?

    if (doc = @_get collection, docName)
      if doc.type is type
        @_ensureOpenState(doc, callback)
      else
        callback 'Type mismatch', doc
      return

    @makeDoc collection, docName, {create:true, type:type.name}, callback

  # Call the callback after the document object is open
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
