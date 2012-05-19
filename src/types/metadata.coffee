# This file implements the OT methods for document metadata. This code is not like the
# regular OT types defined in this directory.
#
# Document metadata is described here:
# https://github.com/josephg/ShareJS/wiki/Document-Metadata
#
# Document metadata is mostly type independant. Except for cursor positions,
# a document's metadata has the same structure regardless of the underlying type
# of the document.
#
# Op components do one of the following:
#   - Add session data for a new client
#   - Remove session data for a client which has logged off
#   - Change a client's cursor position
#   - Change one of the fields of the document
#   - Change a field inside a session
#
# {id:_, as:{....}}
# {id:_, rs:true}
# {id:_, c:_}
# {id:_, p:_, [v:_]}
# {p:_, v:_}
#
# Like the other OT types, ops are lists of op components.


#clone = (o) -> JSON.parse(JSON.stringify o)

checkMop = (meta, mop) ->
  if mop.id
    throw new Error "invalid id #{mop.id}" unless typeof mop.id is 'string'
    throw new Error "Referenced session ID missing" if !mop.as and !meta.sessions[mop.id]
    throw new Error "Cannot change property #{mop.p}" if mop.p and mop.p in ['cursor']
    throw new Error "Not allowed to change another client's session data" if mop.source and mop.source != mop.id
    throw new Error "Session objects must be objects" if mop.as and typeof mop.as isnt 'object'
  else
    throw new Error "Cannot change property #{mop.p}" if mop.p and mop.p in ['sessions', 'ctime', 'mtime']
    throw new Error "Only the server can change the root document metadata" if mop.source

meta =
  name: 'meta'

  # Create the metadata for a new document, using data supplied by the client.
  create: (meta) ->
    now = Date.now()

    meta ||= {}

    #meta.contributors: []
    meta.sessions = {}
    meta.ctime = now
    meta.mtime = now

    meta

  # Apply a document operation to the metadata object
  # side is 'left' or 'right'.
  applyOp: (meta, type, opData, side = 'left') ->
    if opData.meta?.ts
      meta.mtime = opData.meta.ts
      meta.ctime ?= meta.mtime # If an old database has no ctime on documents, add it back in.

    if type.transformCursor
      for id, session of meta.sessions
        if session.cursor?
          session.cursor = type.transformCursor session.cursor, opData.op, side

    meta

  # This is used to transform one metadata operation by another. Metadata ops aren't stored, and
  # aren't transformed by each other. This is needed to make cursor positions work.
  #
  # Like in the OT types, 'side' is 'left' or 'right'.
  transform: (type, mop, op, side) ->
    if mop.c? and type.transformCursor
      # Cursors are the only thing we need to transform.
      # mop.c is the new cursor position, so we just need to transform it by the op.
      type.transformCursor mop.c, op, side

    mop

  # This method applies a metadata operation to the metadata object. It is destructive to
  # the current metadata object. It returns a new value for the document metadata.
  #
  # The important things you can do with m
  #
  # Not setting a newVal (ie, {p:path} alone) will remove the value from the metadata object.
  # I'd use o:null, but then we couldn't have null values in the metadata object.
  applyMop: (meta, mop) ->
    checkMop meta, mop
    
    if mop.n # Initialise new metadata
      meta.sessions = mop.n.sessions
      meta.ctime = mop.n.ctime
      meta.mtime = mop.n.mtime

    else if mop.as # Add session
      meta.sessions[mop.id] = mop.as

    else if mop.rs # Remove session
      delete meta.sessions[mop.id]

    else if mop.c? # Set cursor position
      meta.sessions[mop.id].cursor = mop.c

    else if mop.p # Set property
      if mop.id # ... in a session
        if mop.v is undefined
          delete meta.sessions[mop.id][mop.p]
        else
          meta.sessions[mop.id][mop.p] = mop.v

      else # In the main metadata object
        if mop.v is undefined
          delete meta[mop.p]
        else
          meta[mop.p] = mop.v

    meta

if WEB?
  exports.meta = meta
else
  module.exports = meta

