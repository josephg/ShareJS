# This file implements the sharejs client, as defined here:
# https://github.com/josephg/ShareJS/wiki/Client-API
#
# It works from both a node.js context and a web context (though in the latter case,
# it needs to be compiled to work. use % cake webclient)

if WEB?
  hasBCSocket = window.BCSocket isnt undefined
else
  Connection = require('./connection').Connection


# Open a document with the given name. The connection is created implicitly and reused.
#
# This function uses a local (private) set of connections to support .open().
#
# Open returns the connection its using to access the document.
exports.open = do ->
  # This is a private connection pool for implicitly created connections.
  connections = {}

  getConnection = (origin, authentication) ->
    if WEB? and !origin?
      location = window.location
      origin = "#{location.protocol}//#{location.host}/channel"

    unless connections[origin]
      c = new Connection new BCSocket(origin, reconnect:true), authentication

      del = -> delete connections[origin]
      c.on 'disconnected', del
      c.on 'connect failed', del
      connections[origin] = c

    connections[origin]

  # If you're using the bare API, connections are cleaned up as soon as there's no
  # documents using them.
  maybeClose = (c) ->
    numDocs = 0
    for name, doc of c.docs
      numDocs++ if doc.state isnt 'closed' || doc.autoOpen

    if numDocs == 0
      c.disconnect()

  (collection, docName, type, options, callback) ->
    unless hasBCSocket
      throw new Error 'Cannot find browserchannel. If you want to use a custom channel, create a connection manually.'

    if typeof options is 'function'
      callback = options
      options = {}

    options = origin: options if typeof options is 'string'

    origin = options.origin
    authentication = options.authentication

    c = getConnection origin, authentication
    c.open collection, docName, type, (error, doc) ->
      if error
        callback error
        maybeClose c
      else
        doc.on 'closed', -> maybeClose c

        callback null, doc

    c.on 'connect failed'
    return c


unless WEB?
  exports.Doc = require('./doc').Doc
  exports.Connection = require('./connection').Connection

