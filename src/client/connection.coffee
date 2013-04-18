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
  types = ottypes
  {BCSocket, SockJS, WebSocket} = window
  if BCSocket
    socketImpl = 'channel'
  else
    if SockJS
      socketImpl = 'sockjs'
    else
      socketImpl = 'websocket'
else
  types = require 'ot-types'
  {BCSocket} = require 'browserchannel'
  Doc = require('./doc').Doc
  WebSocket = require 'ws'
  socketImpl = null

class Connection
  _error: (e) ->
    @setState 'stopped', e
    @disconnect e

  constructor: (@socket) ->
    # Map of collection -> docname -> doc
    @collections = {}

    # States:
    # - 'connecting': The connection has been established, but we don't have our client ID yet
    # - 'connected': We have connected and recieved our client ID. Ready for data.
    # - 'disconnected': The connection is closed, but it will reconnect automatically.
    # - 'stopped': The connection is closed, and should not attempt to reconnect.
    @state = 'disconnected'

    @socket.onmessage = (msg) =>
      console.log 'RECV', msg

      if msg.id
        throw new Error 'Invalid protocol version' unless msg.protocol is 0
        throw new Error 'Invalid client id' unless typeof msg.id is 'string'

        # Our very own client id.
        @id = msg.id
        @setState 'connected'
        return

      if msg.doc isnt undefined
        collection = @lastReceivedCollection = msg.c
        docName = @lastReceivedDoc = msg.doc
      else
        collection = msg.c = @lastReceivedCollection
        docName = msg.doc = @lastReceivedDoc

      if (doc = @get collection, docName)
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
      @setState 'connecting'
    
    @reset()


  reset: ->
    @id = @lastError = @lastReceivedDoc = @lastSentDoc = null
    @seq = 1

  setState: (newState, data) ->
    return if @state is newState

    if (newState is 'connecting' and @state isnt 'disconnected') or
        (newState is 'connected' and @state isnt 'connecting')
      throw new Error "Cannot transition directly from #{@state} to #{newState}"

    @state = newState

    @reset() if newState is 'disconnected'
    @emit newState, data

    # Documents could just subscribe to the state change events, but there's less state to
    # clean up when you close a document if I just notify the doucments directly.
    for c, collection of @collections
      for docName, doc of collection
        doc._connectionStateChanged newState, data

  send: (data) ->
    console.log "SEND:", data
    if data.doc # data.doc not set when sending auth request
      docName = data.doc
      collection = data.c

      if collection is @lastSentCollection and docName is @lastSentDoc
        delete data.c
        delete data.doc
      else
        @lastSentCollection = collection
        @lastSentDoc = docName

    @socket.send data

  disconnect: ->
    # This will call @socket.onclose(), which in turn will emit the 'disconnected' event.
    #console.warn 'calling close on the socket'
    @socket.close()


  # *** Doc management
  get: (collection, name) -> @collections[collection]?[name]
  getOrCreate: (collection, name, data) ->
    doc = @get collection, name
    return doc if doc

    doc = new Doc this, collection, name, data
    collection = (@collections[collection] ||= {})
    collection[name] = doc
    

### 
  open: (collection, docName, options, callback) ->
    doc = @openSync collection, name
    doc.on 'ready', ->
      if doc.type and options.type
        doc.create type, -> callback()
      else
        callback()

  openSync: (collection, docName, options = {}) ->
    # options can have:
    # - type:'text'
    # - snapshot:{...}
    # - v:  (if you have a snapshot you also need a version and a type).
    #
    # - subscribe:true / false. Default true.

    
    options.type = types[options.type] if typeof options.type is 'string'

    if typeof options.v is 'number'
      throw new Error 'Missing snapshot' if options.snapshot is undefined
      throw new Error 'Missing type' if options.type is undefined
    else
      delete options.snapshot

    doc = @_get collection, docName
    if doc
      if options.subscribe isnt false
        doc.subscribe()

      return doc

    else
      return @makeDoc collection, docName, options




  makeDoc: (collection, docName, data, callback) ->
    throw new Error("Doc #{docName} already open") if @_get collection, docName
    doc = new Doc(this, collection, docName, data)
    c = (@collections[collection] ||= {})
    c[docName] = doc

    #doc.open (error) =>
    #  if error
    #    delete c[name]
    #  else
    #    doc.on 'closed', => delete c[name]

    #  callback error, (doc unless error)

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
      @on 'connected', -> @open(collection, docName, type, callback)
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
###
# Not currently working.
#  create: (type, callback) ->
#    open null, type, callback

# Make connections event emitters.
unless WEB?
  MicroEvent = require './microevent'

MicroEvent.mixin Connection

exports.Connection = Connection
