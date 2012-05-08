# The model of all the ops. Responsible for applying & transforming remote deltas
# and managing the storage layer.
#
# Actual storage is handled by the database wrappers in db/*, wrapped by DocCache

{EventEmitter} = require 'events'

queue = require './syncqueue'
types = require '../types'
metadata = require '../types/metadata'

isArray = (o) -> Object.prototype.toString.call(o) == '[object Array]'

# This constructor creates a new Model object. There will be one model object
# per server context.
#
# The model object is responsible for a lot of things:
#
# - It manages the interactions with the database
# - It maintains (in memory) a set of all active documents
# - It calls out to the OT functions when necessary
#
# The model is an event emitter. It emits the following events:
#
# create(docName, data): A document has been created with the specified name & data
module.exports = Model = (db, options) ->
  # db can be null if the user doesn't want persistance.

  return new Model(db, options) if !(this instanceof Model)

  model = this

  options ?= {}

  # This is a cache of 'live' documents.
  #
  # The cache is a map from docName -> {
  #   ops:[{op, meta}]
  #   snapshot
  #   type
  #   v
  #   meta
  #   eventEmitter: An event emitter which interested listeners subscribe to
  #   reapTimer
  #   committedVersion: v
  #   snapshotWriteLock: bool to make sure writeSnapshot isn't re-entrant
  #   dbMeta: database specific data
  #   opQueue: syncQueue for processing ops
  # }
  #
  # The ops list contains the document's last options.numCachedOps ops. (Or all
  # of them if we're using a memory store).
  #
  # Documents are stored in this set so long as the document has been accessed in
  # the last few seconds (options.reapTime) OR at least one client has the document
  # open. I don't know if I should keep open (but not being edited) documents live -
  # maybe if a client has a document open but the document isn't being edited, I should
  # flush it from the cache.
  #
  # In any case, the API to model is designed such that if we want to change that later
  # it should be pretty easy to do so without any external-to-the-model code changes.
  docs = {}

  # This is a map from docName -> [callback]. It is used when a document hasn't been
  # cached and multiple getSnapshot() / getVersion() requests come in. All requests
  # are added to the callback list and called when db.getSnapshot() returns.
  #
  # callback(error, snapshot data)
  awaitingGetSnapshot = {}

  # The time that documents which no clients have open will stay in the cache.
  # Should be > 0.
  options.reapTime ?= 3000

  # The number of operations the cache holds before reusing the space
  options.numCachedOps ?= 10

  # This option forces documents to be reaped, even when there's no database backend.
  # This is useful when you don't care about persistance and don't want to gradually
  # fill memory.
  #
  # You might want to set reapTime to a day or something.
  options.forceReaping ?= false

  # Until I come up with a better strategy, we'll save a copy of the document snapshot
  # to the database every ~20 submitted ops.
  options.opsBeforeCommit ?= 20

  # It takes some processing time to transform client ops. The server will punt ops back to the
  # client to transform if they're too old.
  options.maximumAge ?= 40

  # **** Cache API methods
 
  # I would just copy out the db.writeOp function statically (like this):
  #dbWriteOp = db?.writeOp or (docName, newOpData, callback) -> callback()
  # ... but we need to be able to change the database methods from the tests.
  dbWriteOp = (docName, newOpData, callback) ->
    if db then db.writeOp(docName, newOpData, callback) else callback()

  # Internal wrapper around db.writeOp which sometimes also saves the document snapshot.
  writeOp = (docName, doc, opData, newSnapshot, callback) ->
    dbWriteOp docName, opData, (error) ->
      # Note that no changes are made to the doc object until the op has been committed to the database.
      # This is important.

      if error
        # The user should probably know about this.
        console.warn "Error writing ops to database: #{error}"
        return callback error

      options.stats?.writeOp?()

      # This is needed when we emit the 'change' event, below.
      oldSnapshot = doc.snapshot

      # All the heavy lifting is now done. Finally, we'll update the cache with the new data
      # and (maybe!) save a new document snapshot to the database.

      doc.v = opData.v + 1
      doc.snapshot = newSnapshot
      doc.meta = metadata.applyOp doc.meta, doc.type, opData, 'left' # TODO: Left or right??

      doc.ops.push opData
      doc.ops.shift() if db and doc.ops.length > options.numCachedOps

      model.emit 'applyOp', docName, opData, newSnapshot, oldSnapshot
      doc.eventEmitter.emit 'op', opData, newSnapshot, oldSnapshot

      # The callback is called with the version of the document at which the op was applied.
      # This is the op.v after transformation, and its doc.v - 1.
      callback null, opData.v
  
      # I need a decent strategy here for deciding whether or not to save the snapshot.
      #
      # The 'right' strategy looks something like "Store the snapshot whenever the snapshot
      # is smaller than the accumulated op data". For now, I'll just store it every 20
      # ops or something. (Configurable with doc.committedVersion)
      if !doc.snapshotWriteLock and doc.committedVersion + options.opsBeforeCommit <= doc.v
        tryWriteSnapshot docName, (error) ->
          console.warn "Error writing snapshot #{error}. This is nonfatal" if error


  # Its important that all ops are applied in order. This helper method creates the op submission queue
  # for a single document. This contains the logic for transforming & applying ops.
  #
  # To avoid race conditions with metadata ops, all metadata ops are also passed through this function.
  # type is either 'op' or 'mop' depending on the type of op that is being applied.
  makeOpQueue = (docName, doc) -> queue (opData, callback) ->
    return callback 'Version missing' unless opData.v >= 0
    return callback 'Op at future version' if opData.v > doc.v

    # Punt the transforming work back to the client if the op is too old.
    return callback 'Op too old' if opData.v + options.maximumAge < doc.v

    opData.meta ||= {}
    opData.meta.ts ?= Date.now()

    # We'll need to transform the op to the current version of the document. This
    # calls the callback immediately if opVersion == doc.v.
    #
    # This whole get old ops & transform process is unnessary for non-cursor metadata ops. (Except for cursor
    # changes, Metadata ops are just applied in the order they're received). But those kind of metadata ops
    # are rare anyway (and getOps usually calls its callback immediately). So its probably not worth the extra
    # complexity.
    getOps docName, opData.v, doc.v, (error, ops) ->
      return callback error if error

      unless doc.v - opData.v == ops.length
        # This should never happen. It indicates that we didn't get all the ops we
        # asked for. Its important that the submitted op is correctly transformed.
        console.error "Could not get old ops in model for document #{docName}"
        console.error "Expected ops #{opData.v} to #{doc.v} and got #{ops.length} ops"
        return callback 'Internal error'

      if ops.length > 0
        try
          # If there's enough ops, it might be worth spinning this out into a webworker thread.
          for oldOp in ops
            # Dup detection works by sending the id(s) the op has been submitted with previously.
            # If the id matches, we reject it. The client can also detect the op has been submitted
            # already if it sees its own previous id in the ops it sees when it does catchup.
            if oldOp.meta.source and opData.dupIfSource and oldOp.meta.source in opData.dupIfSource
              return callback 'Op already submitted'

            if opData.op
              opData.op = doc.type.transform opData.op, oldOp.op, 'left'
            else
              opData.mop = metadata.transform opData.mop, oldOp.op, 'left'
            opData.v++

        catch error
          console.error error.stack
          return callback error.message

      # The op data should be at the current version, and the new document data should be at
      # the next version.
      #
      # This should never happen in practice, but its a nice little check to make sure everything
      # is hunky-dory.
      unless opData.v == doc.v
        # This should never happen.
        console.error "Version mismatch detected in model. File a ticket - this is a bug."
        console.error "Expecting #{opData.v} == #{doc.v}"
        return callback 'Internal error'

      try
        if opData.op
          newSnapshot = doc.type.apply doc.snapshot, opData.op
          writeOp docName, doc, opData, newSnapshot, callback
        else # Metadata op.
          doc.meta = applyMop doc.meta, opData.mop
          doc.eventEmitter.emit 'mop', opData, doc.meta
          callback()
          
      catch error
        console.error error.stack
        return callback error.message

  # Add the data for the given docName to the cache. The named document shouldn't already
  # exist in the doc set.
  #
  # Returns the new doc.
  add = (docName, error, data, committedVersion, ops, dbMeta) ->
    callbacks = awaitingGetSnapshot[docName]
    delete awaitingGetSnapshot[docName]

    if error
      callback error for callback in callbacks if callbacks
    else
      throw new Error "Doc #{docName} already exists" if docs[docName]
      throw new Error 'Add should be called with the type object' unless typeof data.type is 'object'

      doc = docs[docName] =
        snapshot: data.snapshot
        v: data.v
        type: data.type
        meta: data.meta

        # Cache of ops
        ops: ops or []

        eventEmitter: new EventEmitter

        # Timer before the document will be invalidated from the cache (if the document has no
        # listeners)
        reapTimer: null

        # Version of the snapshot thats in the database
        committedVersion: committedVersion ? data.v
        snapshotWriteLock: false
        dbMeta: dbMeta

      doc.opQueue = makeOpQueue docName, doc
      doc.meta.sessions = {}
      
      refreshReapingTimeout docName
      callback null, doc for callback in callbacks if callbacks

    doc
  
  # This is a little helper wrapper around db.getOps. It does two things:
  #
  # - If there's no database set, it returns an error to the callback
  # - It adds version numbers to each op returned from the database
  # (These can be inferred from context so the DB doesn't store them, but its useful to have them).
  getOpsInternal = (docName, start, end, callback) ->
    return callback? 'Document does not exist' unless db

    db.getOps docName, start, end, (error, ops) ->
      return callback? error if error

      v = start
      op.v = v++ for op in ops

      callback? null, ops

  # Load the named document into the cache. This function is re-entrant.
  #
  # The callback is called with (error, doc)
  load = (docName, callback) ->
    if docs[docName]
      # The document is already loaded. Return immediately.
      options.stats?.cacheHit? 'getSnapshot'
      return callback null, docs[docName]

    # We're a memory store. If we don't have it, nobody does.
    return callback 'Document does not exist' unless db

    callbacks = awaitingGetSnapshot[docName]

    # The document is being loaded already. Add ourselves as a callback.
    return callbacks.push callback if callbacks

    options.stats?.cacheMiss? 'getSnapshot'

    # The document isn't loaded and isn't being loaded. Load it.
    awaitingGetSnapshot[docName] = [callback]
    db.getSnapshot docName, (error, data, dbMeta) ->
      return add docName, error if error

      type = types[data.type]
      unless type
        console.warn "Type '#{data.type}' missing"
        return callback "Type not found"
      data.type = type

      committedVersion = data.v

      # The server can close without saving the most recent document snapshot.
      # In this case, there are extra ops which need to be applied before
      # returning the snapshot.
      getOpsInternal docName, data.v, null, (error, ops) ->
        return callback error if error

        if ops.length > 0
          console.log "Catchup #{docName} #{data.v} -> #{data.v + ops.length}"

          try
            for op in ops
              data.snapshot = type.apply data.snapshot, op.op
              data.meta = metadata.applyOp data.meta, data.type, op # Updates mtime.
              data.v++
          catch e
            # This should never happen - it indicates that whats in the
            # database is invalid.
            console.error "Op data invalid for #{docName}: #{e.stack}"
            return callback 'Op data invalid'

        add docName, error, data, committedVersion, ops, dbMeta

  # This makes sure the cache contains a document. If the doc cache doesn't contain
  # a document, it is loaded from the database and stored.
  #
  # Documents are stored so long as either:
  # - They have been accessed within the past #{PERIOD}
  # - At least one client has the document open
  refreshReapingTimeout = (docName) ->
    doc = docs[docName]
    return unless doc

    # I want to let the clients list be updated before this is called.
    process.nextTick ->
      # This is an awkward way to find out the number of clients on a document. If this
      # causes performance issues, add a numClients field to the document.
      #
      # The first check is because its possible that between refreshReapingTimeout being called and this
      # event being fired, someone called delete() on the document and hence the doc is something else now.
      if doc == docs[docName] and
          doc.eventEmitter.listeners('op').length == 0 and
          (db or options.forceReaping) and
          doc.opQueue.busy is false

        clearTimeout doc.reapTimer
        doc.reapTimer = reapTimer = setTimeout ->
            tryWriteSnapshot docName, ->
              # If the reaping timeout has been refreshed while we're writing the snapshot, or if we're
              # in the middle of applying an operation, don't reap.
              delete docs[docName] if docs[docName].reapTimer is reapTimer and doc.opQueue.busy is false
          , options.reapTime

  tryWriteSnapshot = (docName, callback) ->
    return callback?() unless db

    doc = docs[docName]

    # The doc is closed
    return callback?() unless doc

    # The document is already saved.
    return callback?() if doc.committedVersion is doc.v

    return callback? 'Another snapshot write is in progress' if doc.snapshotWriteLock

    doc.snapshotWriteLock = true

    options.stats?.writeSnapshot?()

    writeSnapshot = db?.writeSnapshot or (docName, docData, dbMeta, callback) -> callback()

    data =
      v: doc.v
      meta: {}
      snapshot: doc.snapshot
      # The database doesn't know about object types.
      type: doc.type.name

    data.meta[k] = v for k, v of doc.meta when k isnt 'sessions'

    # Commit snapshot.
    writeSnapshot docName, data, doc.dbMeta, (error, dbMeta) ->
      doc.snapshotWriteLock = false

      return callback? error if error

      # We have to use data.v here because the version in the doc could
      # have been updated between the call to writeSnapshot() and now.
      doc.committedVersion = data.v
      doc.dbMeta = dbMeta
      callback?()

  # *** Model interface methods

  # Create a new document.
  #
  # data should be {snapshot, type, [meta]}. The version of a new document is 0.
  @create = (docName, type, meta, callback) ->
    [meta, callback] = [{}, meta] if typeof meta is 'function'

    return callback? 'Invalid document name' if docName.match /\//
    return callback? 'Document already exists' if docs[docName]

    type = types[type] if typeof type == 'string'
    return callback? 'Type not found' unless type

    data =
      v:0
      meta:metadata.create meta
      snapshot:type.create()
      type:type.name
    # The db doesn't store the empty session list. Sessions are added back in by add().
    delete data.meta.sessions

    create = db?.create or (docName, data, callback) -> callback()

    create docName, data, (error, dbMeta) ->
      # dbMeta can be used to cache extra state needed by the database to access the document,
      # like an ID or something.
      return callback? error if error

      # From here on we'll store the object version of the type name.
      data.type = type
      add docName, null, data, 0, [], dbMeta
      model.emit 'create', docName, data
      callback?()

  # Perminantly deletes the specified document.
  # If listeners are attached, they are removed.
  # 
  # The callback is called with (error) if there was an error. If error is null / undefined, the
  # document was deleted.
  #
  # WARNING: This isn't well supported throughout the code. (Eg, streaming clients aren't told about the
  # deletion. Subsequent op submissions will fail).
  @delete = (docName, callback) ->
    doc = docs[docName]

    if doc
      clearTimeout doc.reapTimer
      delete docs[docName]

    done = (error) ->
      model.emit 'delete', docName unless error
      callback? error

    if db
      db.delete docName, doc?.dbMeta, done
    else
      done (if !doc then 'Document does not exist')

  # This gets all operations from [start...end]. (That is, its not inclusive.)
  #
  # end can be null. This means 'get me all ops from start'.
  #
  # Each op returned is in the form {op:o, meta:m, v:version}.
  #
  # Callback is called with (error, [ops])
  #
  # If the document does not exist, getOps doesn't necessarily return an error. This is because
  # its awkward to figure out whether or not the document exists for things
  # like the redis database backend. I guess its a bit gross having this inconsistant
  # with the other DB calls, but its certainly convenient.
  #
  # Use getVersion() to determine if a document actually exists, if thats what you're
  # after.
  @getOps = getOps = (docName, start, end, callback) ->
    # getOps will only use the op cache if its there. It won't fill the op cache in.
    throw new Error 'start must be 0+' unless start >= 0

    [end, callback] = [null, end] if typeof end is 'function'

    ops = docs[docName]?.ops

    if ops
      version = docs[docName].v

      # Ops contains an array of ops. The last op in the list is the last op applied
      end ?= version
      start = Math.min start, end

      return callback null, [] if start == end

      # Base is the version number of the oldest op we have cached
      base = version - ops.length

      # If the database is null, we'll trim to the ops we do have and hope thats enough.
      if start >= base or db is null
        refreshReapingTimeout docName
        options.stats?.cacheHit 'getOps'

        return callback null, ops[(start - base)...(end - base)]

    options.stats?.cacheMiss 'getOps'

    getOpsInternal docName, start, end, callback

  # Gets the snapshot data for the specified document.
  # getSnapshot(docName, callback)
  # Callback is called with (error, {v: <version>, type: <type>, snapshot: <snapshot>, meta: <meta>})
  @getSnapshot = (docName, callback) ->
    load docName, (error, doc) ->
      callback error, if doc then {v:doc.v, type:doc.type, snapshot:doc.snapshot, meta:doc.meta}

  # Gets the latest version # of the document.
  # getVersion(docName, callback)
  # callback is called with (error, version).
  @getVersion = (docName, callback) ->
    load docName, (error, doc) -> callback error, doc?.v

  # Apply an op to the specified document.
  # The callback is passed (error, applied version #)
  # opData = {op:op, v:v, meta:metadata}
  # 
  # Ops are queued before being applied so that the following code applies op C before op B:
  # model.applyOp 'doc', OPA, -> model.applyOp 'doc', OPB
  # model.applyOp 'doc', OPC
  @applyOp = (docName, opData, callback) ->
    # All the logic for this is in makeOpQueue, above.
    load docName, (error, doc) ->
      return callback error if error

      process.nextTick -> doc.opQueue opData, (error, newVersion) ->
        refreshReapingTimeout docName
        callback? error, newVersion

  # TODO: store (some) metadata in DB
  # TODO: op and meta should be combineable in the op that gets sent
  @applyMetaOp = (docName, metaOpData, callback) ->
    load docName, (error, doc) ->
      return callback error if error

      # opQueue disambiguates by looking for opData.op or opData.mop
      process.nextTick -> doc.opQueue metaOpData, (error) ->
        refreshReapingTimeout docName
        callback? error

  # Listen to all ops from the specified version. If version is in the past, all
  # ops since that version are sent immediately to the listener.
  #
  # The callback is called once the listener is attached, but before any ops have been passed
  # to the listener.
  # 
  # This will _not_ edit the document metadata.
  #
  # If there are any listeners, we don't purge the document from the cache. But be aware, this behaviour
  # might change in a future version.
  #
  # version is the document version at which the document is opened. It can be left out if you want to open
  # the document at the most recent version.
  #
  # listener is called with (opData) each time an op is applied.
  #
  # callback(error, openedVersion)
  @listen = (docName, version, listener, callback) ->
    [version, listener, callback] = [null, version, listener] if typeof version is 'function'

    load docName, (error, doc) ->
      return callback? error if error

      clearTimeout doc.reapTimer

      if version?
        getOps docName, version, null, (error, data) ->
          return callback? error if error

          doc.eventEmitter.on 'op', listener
          callback? null, version
          for op in data
            listener op

            # The listener may well remove itself during the catchup phase. If this happens, break early.
            # This is done in a quite inefficient way. (O(n) where n = #listeners on doc)
            break unless listener in doc.eventEmitter.listeners 'op'

      else # Version is null / undefined. Just add the listener.
        doc.eventEmitter.on 'op', listener
        callback? null, doc.v

  # Remove a listener for a particular document.
  #
  # removeListener(docName, listener)
  #
  # This is synchronous.
  @removeListener = (docName, listener) ->
    # The document should already be loaded.
    doc = docs[docName]
    throw new Error 'removeListener called but document not loaded' unless doc

    doc.eventEmitter.removeListener 'op', listener
    refreshReapingTimeout docName

  # Flush saves all snapshot data to the database. I'm not sure whether or not this is actually needed -
  # sharejs will happily replay uncommitted ops when documents are re-opened anyway.
  @flush = (callback) ->
    return callback?() unless db

    pendingWrites = 0

    for docName, doc of docs
      if doc.committedVersion < doc.v
        pendingWrites++
        # I'm hoping writeSnapshot will always happen in another thread.
        tryWriteSnapshot docName, ->
          process.nextTick ->
            pendingWrites--
            callback?() if pendingWrites is 0

    # If nothing was queued, terminate immediately.
    callback?() if pendingWrites is 0

  # Close the database connection. This is needed so nodejs can shut down cleanly.
  @closeDb = ->
    db?.close?()
    db = null

  return

# Model inherits from EventEmitter.
Model:: = new EventEmitter

