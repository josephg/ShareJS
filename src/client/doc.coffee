unless WEB?
  types = require 'ot-types'

if WEB?
  exports.extendDoc = (name, fn) ->
    Doc::[name] = fn

# A Doc is a client's view on a sharejs document.
#
# Documents are created by calling Connection.open().
#
# Documents are event emitters - use doc.on(eventname, fn) to subscribe.
#
# Documents get mixed in with their type's API methods. So, you can .insert('foo', 0) into
# a text document and stuff like that.
#
# Events:
#  - remoteop (op)
#  - changed (op)
#  - acknowledge (op)
#  - error
#  - open, closing, closed. 'closing' is not guaranteed to fire before closed.
class Doc
  # connection is a Connection object.
  # name is the documents' docName.
  # data can optionally contain known document data, and initial open() call arguments:
  # {v[erson], snapshot={...}, type}
  constructor: (@connection, @collection, @name, data) ->
    # Subscribe status. This is only updated when we get messages from the server, or when
    # we get disconnected.
    @subscribed = false
    @subscribeRequested = false

    # The op that is currently roundtripping to the server, or null.
    #
    # When the connection reconnects, the inflight op is resubmitted.
    #
    # This has the same format as an entry in pendingData, which is:
    # {[create:{...}], [del:true], [op:...], callbacks:[...], src:, seq:}
    @inflightData = null

    # All ops that are waiting for the server to acknowledge @inflightData
    # This used to just be a single operation, but creates & deletes can't be composed with
    # regular operations.
    #
    # This is a list of {[create:{...}], [del:true], [op:...], callbacks:[...]}
    @pendingData = []

    @_injestData data if data?.snapshot isnt undefined

  _send: (message) ->
    message.c = @collection
    message.doc = @name
    @connection.send message
  
  subscribe: (callback) ->
    # If we're already subscribed, just call the callback and be done with it.
    return callback?() if @subscribed
    if @subscribeRequested
      @once 'subscribed', callback if callback
      return

    @subscribeRequested = yes
    
    if callback then @_subscribeCallback = (error) =>
      @_subscribeCallback = null
      callback error

    # Only send the message if we're connecting/connected. Otherwise subscribe() will get called
    # again when the connection is resumed.
    return if @connection.state is 'disconnected'
    msg = a:'sub'
    msg.v = @version if typeof @version is 'number'
    @_send msg

  # Unsubscribe the document from the server. Note that we will continue receiving updates until this
  # message has been confirmed.
  unsubscribe: (callback) ->
    return unless @subscribeRequested
    @subscribeRequested = false

    return if @connection.state is 'disconnected'
    if callback then @_unsubscribeCallback = (error) =>
      @_unsubscribeCallback = null
      callback error

    @_send a:'unsub'

  fetch: (callback) ->
    @once 'fetched', callback if callback
    @_send a:'fetch'

  _connectionStateChanged: (state, data) ->
    switch state
      when 'disconnected'
        @subscribed = false

      when 'connecting'
        if @subscribeRequested
          @subscribeRequested = false
          @subscribe()

        @_sendOpData @inflightData if @inflightData

    @emit state, data

  _setType: (type) ->
    if typeof type is 'string'
      throw new Error "Missing type #{type}" unless types[type]
      type = types[type]

    throw new Error 'Support for types without compose() is not implemented' if type and !type.compose

    # Unregister the old type
    if @type?.api
      @removeListener 'op', @_onOp if @_onOp
      delete this[k] for k of @type.api

    # Actually set it
    @type = type
    @snapshot = null unless @type

    # And register any new API methods.
    if type?.api
      this[k] = v for k, v of type.api
      @on 'op', @_onOp if @_onOp
    else
      @provides = {}

  # Injest data from a stored snapshot or from the server
  _injestData: (data) ->
    # data.type could be:
    # - a string name
    # - an object (the type itself)
    # - null (the document doesn't exist on the server)
    # - undefined (the type is unknown)
    throw new Error 'Missing version' unless typeof data.v is 'number'

    if typeof @version is 'number'
      # We already have data! Ignore the new stuff, its only going to
      # confuse us.
      console?.warn 'Ignoring extra attempt to injest data'
      return

    @version = data.v
    @snapshot = data.snapshot
    @_setType data.type

  setNoOp = (data) ->
    delete data.op
    delete data.create
    delete data.del

  # Transform server op data by client op data, and vice versa.
  _xf: (client, server) ->
    # In this case, we're in for some fun. There are some local operations
    # which are totally invalid - either the client continued editing a
    # document that someone else deleted or a document was created both on the
    # client and on the server. In either case, the local document is way
    # invalid and the client's ops are useless.
    #
    # The client becomes a no-op, and we keep the server op entirely.
    return setNoOp client if server.create or server.del

    # The client has deleted the document while the server edited it. Kill
    # the server's op.
    return setNoOp server if client.del

    # It should be impossible to create a document when it currently already
    # exists.
    throw new Error 'Invalid state. This is a bug. Please file an issue on github' if client.create

    # We return here if the server or client operations are noops.
    return unless server.op and client.op

    # They both edited the document. This is the normal case for this function.
    if client.type.transformX
      [client.op, server.op] = client.type.transformX(client.op, server.op)
    else
      client.op = @type.transform client.op, server.op, 'left'
      server.op = @type.transform server.op, client.op, 'right'
  
  _otApply: (opData, isLocal) ->
    @locked = true
    if (create = opData.create)
      # If the type is currently set, it means we tried creating the document
      # and someone else won. client create x server create = server create.
      @_setType create.type
      @snapshot = @type.create create.data

      setTimeout (=> @emit 'ready', isLocal), 0
      setTimeout (=> @emit 'created', isLocal), 0
    else if opData.del
      # The type should always exist in this case. del x _ = del
      @_setType null

      setTimeout (=> @emit 'deleted', isLocal), 0
    else if (op = opData.op)
      throw new Error 'Document does not exist' unless @type
      op = opData.op
      @emit 'before op', op, isLocal

      # This exists so clients can pull any necessary data out of the snapshot
      # before it gets changed.  Previously we kept the old snapshot object and
      # passed it to the op event handler. However, apply no longer guarantees
      # the old object is still valid.
      if @incremental and @type.incrementalApply
        @type.incrementalApply @snapshot, op, (o, @snapshot) =>
          @emit 'op', o, isLocal
      else
        @snapshot = @type.apply @snapshot, op
        @emit 'op', op, isLocal
    else
      # no-op. Ignore.
      console?.warn 'Ignoring received no-op.', opData

  # This should be called right after _otApply.
  _afterOtApply: (opData, isLocal) ->
    @locked = false
    @emit 'after op', opData.op, isLocal if opData.op

  # Now for the hard stuff - mirroring server state

  _tryRollback: (opData) ->
    # This happens if the server rejects our op for some reason. There's not much
    # we can do here if the OT type is noninvertable, but that shouldn't happen
    # too much in real life because readonly documents should be flagged as such.
    #
    # (We should probably figure out some way to flag that).

    if opData.create
      @_setType null

    else if opData.op and opData.type.invert
      undo = opData.type.invert opData.op

      # Now we have to transform the undo operation by any pending ops
      @_xf p, undo for p in @pendingData

      # ... and apply it locally, reverting the changes.
      # 
      # This call will also call @emit 'remoteop'. I'm still not 100% sure about this
      # functionality, because its really a local op. Basically, the problem is that
      # if the client's op is rejected by the server, the editor window should update
      # to reflect the undo.
      @_otApply undo, false
      @_afterOtApply undo, false
    else
      # This is where an undo stack would come in handy.
      @emit 'error', "Op apply failed and the operation could not be reverted"
      @_setType null
      @v = null
      @fetch()

  _opAcknowledged: (msg) ->
    # We've tried to resend an op to the server, which has already been received successfully. Do nothing.
    # The op will be confirmed normally when the op itself is echoed back from the server
    # (handled below).
    return if error is 'Op already submitted'

    # Our inflight op has been acknowledged.
    acknowledgedData = @inflightData
    @inflightData = null

    error = msg.error
    if error
      # The server has rejected an op from the client for some reason.
      # We'll send the error message to the user and roll back the change.
      @_tryRollback acknowledgedData
    else
      throw new Error 'Invalid version from server. Please file an issue, this is a bug.' unless msg.v == @version

      # The op applied successfully.
      @version++
      @emit 'acknowledge', acknowledgedData

    callback error for callback in acknowledgedData.callbacks

    # Consider sending the next op.
    @flush()

  _onMessage: (msg) ->
    unless msg.c is @collection and msg.doc is @name
      throw new Error "Got message for wrong document. Expected '#{@collection}'.'#{@name}' but got '#{msg.c}'.'#{msg.doc}'"

    switch msg.a
      when 'data'
        # Nom.
        @_injestData msg
        @emit 'ready' if @type
        @emit 'fetched'

      when 'sub'
        # The server is responding to our subscribe request.
        if msg.error
          # An error occurred opening the document.
          console?.error "Could not open document: #{msg.error}"
          @emit 'error', msg.error
          @subscribed = no
          @subscribeRequested = no
          @_subscribeCallback? msg.error

          break

        # The document has been successfully opened.
        
        @subscribed = yes
        @emit 'subscribed'
        @_subscribeCallback?()

        # Try to resend any operations that were queued while we (might have been) offline.
        @flush()
   
      when 'unsub'
        # The document has been closed
        @subscribed = no
        @emit 'unsubscribed'
        @_unsubscribeCallback?()

      when 'ack' # Acknowledge a locally submitted operation
        @_opAcknowledged msg if msg.error

      when 'op'
        # There's a new op from the server
        # msg is {doc:, op:, v:}
        if @inflightData and msg.src is @inflightData.src and msg.seq is @inflightData.seq
          @_opAcknowledged msg
          break

        return @emit 'error', "Expected version #{@version} but got #{msg.v}" unless msg.v == @version

        opData = msg
        @_xf @inflightData, opData if @inflightData
        @_xf pending, opData for pending in @pendingData
          
        @version++
        # Finally, apply the op to @snapshot and trigger any event listeners
        @_otApply opData, false
        @_afterOtApply opData, false

      when 'meta'
        {path, value} = msg.meta

        console?.warn 'Unhandled meta op:', msg

      else
        console?.warn 'Unhandled document message:', msg

  _submitOpData: (opData, callback) ->
    error = (err) ->
      if callback then callback(err) else console?.warn 'Failed attempt to submitOp:', err

    return error 'You cannot currently submit operations to an unsubscribed document' unless @subscribeRequested
    return error "Cannot call submitOp from inside an 'op' event handler" if @locked

    if opData.op
      error 'Document has not been created' unless @type
      opData.op = @type.normalize(opData.op) if @type.normalize?

    # If this throws an exception, no changes should have been made to the doc
    @_otApply opData, true

    if opData.op and @pendingData.length and (entry = @pendingData[@pendingData.length - 1]).op
      entry.op = @type.compose entry.op, opData.op
    else
      entry = opData
      opData.type = @type # The actual type or null at the time the op was submitted.
      opData.callbacks = []
      @pendingData.push opData

    entry.callbacks.push callback if callback
    
    @_afterOtApply opData, true
    
    # A timeout is used so if the user sends multiple ops at the same time, they'll be composed
    # & sent together.
    setTimeout (=> @flush()), 0

  # Submit an op to the server. The op maybe held for a little while before being sent, as only one
  # op can be inflight at any time.
  #
  # You cannot recursively call submitOp from inside a 'before op' or 'op' event handler. Use on 'after op'
  # if thats what you're after.
  submitOp: (op, callback) -> @_submitOpData {op}, callback

  create: (type, data, callback) ->
    [data, callback] = [undefined, data] if typeof data is 'function'
    return callback? 'Document already exists' if @type
    @_submitOpData {create:{type, data}}, callback

  del: (callback) ->
    return callback? 'Document does not exist' unless @type
    @_submitOpData {del:true}, callback

  _sendOpData: (d) ->
    msg =
      a:'op'
      v:@version

    if d.src
      msg.src = d.src
      msg.seq = d.seq
    
    msg.op = d.op if d.op
    msg.create = d.create if d.create
    msg.del = d.del if d.del
    @_send msg

    # The first time we send an op, its id and sequence number is implicit.
    unless d.src
      d.src = @connection.id
      d.seq = @connection.seq++

  # Send ops to the server, if appropriate.
  #
  # Only one op can be in-flight at a time, so if an op is already on its way then
  # this method does nothing.
  flush: ->
    return unless @connection.state in ['connecting', 'connected'] and @inflightData == null and @pendingData.length

    @inflightData = @pendingData.shift()
    @_sendOpData @inflightData

  getSnapshot: -> @snapshot
  
# Make documents event emitters
unless WEB?
  MicroEvent = require './microevent'

MicroEvent.mixin Doc

exports.Doc = Doc
