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
  # {v[erson], snapshot={...}, type, create=true/false/undefined}
  # callback will be called once the document is first opened.
  constructor: (@connection, @collection, @name, openData) ->
    # Any of these can be null / undefined at this stage.
    openData ||= {}
    @version = openData.v
    @snapshot = openData.snaphot
    @_setType openData.type if openData.type

    @state = 'closed'
    @autoOpen = false

    # Has the document already been created?
    @_create = openData.create

    # The op that is currently roundtripping to the server, or null.
    #
    # When the connection reconnects, the inflight op is resubmitted.
    @inflightOp = null
    @inflightCallbacks = []

    # All ops that are waiting for the server to acknowledge @inflightOp
    @pendingOp = null
    @pendingCallbacks = []

    # Some recent ops, incase submitOp is called with an old op version number.
    @serverOps = {}

  _send: (message) ->
    message.c = @collection
    message.doc = @name
    @connection.send message

  # Transform a server op by a client op, and vice versa.
  _xf: (client, server) ->
    if @type.transformX
      @type.transformX(client, server)
    else
      client_ = @type.transform client, server, 'left'
      server_ = @type.transform server, client, 'right'
      return [client_, server_]
  
  _otApply: (docOp, isRemote) ->
    oldSnapshot = @snapshot
    @snapshot = @type.apply(@snapshot, docOp)

    # Its important that these event handlers are called with oldSnapshot.
    # The reason is that the OT type APIs might need to access the snapshots to
    # determine information about the received op.
    @emit 'change', docOp, oldSnapshot
    @emit 'remoteop', docOp, oldSnapshot if isRemote
  
  _connectionStateChanged: (state, data) ->
    switch state
      when 'disconnected'
        @state = 'closed'

        @emit 'closed'

      when 'connected' # Might be able to do this when we're connecting... that would save a roundtrip.
        @open() if @autoOpen

      when 'stopped'
        @_openCallback? data

    @emit state, data

  _setType: (type) ->
    if typeof type is 'string'
      type = types[type]

    throw new Error 'Support for types without compose() is not implemented' unless type and type.compose

    @type = type
    if type.api
      this[k] = v for k, v of type.api
      @_register?()
    else
      @provides = {}

  _opConfirmed: (msg) ->
    # We've tried to resend an op to the server, which has already been received successfully. Do nothing.
    # The op will be confirmed normally when we get the op itself was echoed back from the server
    # (handled below).
    return if error is 'Op already submitted'

    # Our inflight op has been acknowledged.
    oldInflightOp = @inflightOp
    @inflightOp = null
    @sentSrc = @sentSeq = null

    error = msg.error
    if error
      # The server has rejected an op from the client for some reason.
      # We'll send the error message to the user and roll back the change.
      #
      # If the server isn't going to allow edits anyway, we should probably
      # figure out some way to flag that (readonly:true in the open request?)
      if @type.invert
        undo = @type.invert oldInflightOp

        # Now we have to transform the undo operation by any server ops & pending ops
        if @pendingOp
          [@pendingOp, undo] = @_xf @pendingOp, undo

        # ... and apply it locally, reverting the changes.
        # 
        # This call will also call @emit 'remoteop'. I'm still not 100% sure about this
        # functionality, because its really a local op. Basically, the problem is that
        # if the client's op is rejected by the server, the editor window should update
        # to reflect the undo.
        @_otApply undo, true
      else
        # This is where an undo stack would come in handy.
        @emit 'error', "Op apply failed (#{error}) and the op could not be reverted"

      callback error for callback in @inflightCallbacks
    else
      # The op applied successfully.
      throw new Error('Invalid version from server') unless msg.v == @version

      @serverOps[@version] = oldInflightOp
      @version++
      @emit 'acknowledge', oldInflightOp
      callback null, oldInflightOp for callback in @inflightCallbacks

    @inflightCallbacks.length = 0

    # Send the next op.
    @flush()



  _onMessage: (msg) ->
    unless msg.c is @collection and msg.doc is @name
      throw new Error "Got message for wrong document. Expected '#{@collection}'.'#{@name}' but got '#{msg.c}'.'#{msg.doc}'"

    switch msg.a
      when 'sub'
        # The server is responding to our subscribe request.
        if msg.error
          # An error occurred opening the document.
          console?.error "Could not open document: #{msg.error}"
          @emit 'error', msg.error
          @_openCallback? msg.error
          break

        # The document has been successfully opened.
        @state = 'open'
        @_create = false # Don't try and create the document again next time open() is called.

        @_setType msg.type if msg.type

        if msg.create
          @created = true
        else
          @created = false unless @created is true

        @snapshot = msg.snapshot if msg.snapshot isnt undefined

        @meta = msg.meta if msg.meta
        @version = msg.v if msg.v?

        # Resend any previously queued operation.
        @flush()

        @emit 'open'
        
        @_openCallback? null
   
      when 'unsub'
        # The document has been closed
        @state = 'closed'
        @emit 'closed'

        @_closeCallback?()
        @_closeCallback = null

      when 'ack' # Acknowledge a locally submitted operation
        @_opConfirmed msg if msg.error

      when 'op'
        # There's a new op from the server
        # msg is {doc:, op:, v:}

        if msg.src is @sentSrc and msg.seq is @sentSeq
          @_opConfirmed msg
          break
        #console.log msg.src, @sentSrc, msg.seq, @sentSeq

        return @emit 'error', "Expected version #{@version} but got #{msg.v}" unless msg.v == @version

        #p "if: #{i @inflightOp} pending: #{i @pendingOp} doc '#{@snapshot}' op: #{i msg.op}"

        op = msg.op
        @serverOps[@version] = op

        docOp = op
        if @inflightOp != null
          [@inflightOp, docOp] = @_xf @inflightOp, docOp
        if @pendingOp != null
          [@pendingOp, docOp] = @_xf @pendingOp, docOp
          
        @version++
        # Finally, apply the op to @snapshot and trigger any event listeners
        @_otApply docOp, true

      when 'meta'
        {path, value} = msg.meta

        console?.warn 'Unhandled meta op:', msg

      else
        console?.warn 'Unhandled document message:', msg


  # Send ops to the server, if appropriate.
  #
  # Only one op can be in-flight at a time, so if an op is already on its way then
  # this method does nothing.
  flush: =>
    return unless @connection.state == 'connected' and @inflightOp == null and @pendingOp != null

    # Rotate null -> pending -> inflight
    @inflightOp = @pendingOp
    @inflightCallbacks = @pendingCallbacks

    @sentSrc = @connection.id
    @sentSeq = @connection.seq++

    @pendingOp = null
    @pendingCallbacks = []

    @_send {a:'op', op:@inflightOp, v:@version}

  # Submit an op to the server. The op maybe held for a little while before being sent, as only one
  # op can be inflight at any time.
  submitOp: (op, callback) ->
    op = @type.normalize(op) if @type.normalize?

    # If this throws an exception, no changes should have been made to the doc
    @snapshot = @type.apply @snapshot, op

    if @pendingOp != null
      @pendingOp = @type.compose(@pendingOp, op)
    else
      @pendingOp = op

    @pendingCallbacks.push callback if callback

    @emit 'change', op

    # A timeout is used so if the user sends multiple ops at the same time, they'll be composed
    # & sent together.
    setTimeout @flush, 0
  
  # Open a document. The document starts closed.
  open: (callback) ->
    @autoOpen = true
    return unless @state is 'closed'

    message = a:'sub'
    message.type = @type.uri if @type
    message.v = @version if @version?

    @_send message

    @state = 'opening'

    @_openCallback = (error) =>
      @_openCallback = null
      callback? error

  # Close a document.
  close: (callback) ->
    @autoOpen = false
    return callback?() if @state is 'closed'

    @_send {open:false}

    # Should this happen immediately or when we get open:false back from the server?
    @state = 'closed'

    @emit 'closing'
    @_closeCallback = callback
 
# Make documents event emitters
unless WEB?
  MicroEvent = require './microevent'

MicroEvent.mixin Doc

exports.Doc = Doc
