# This implements the network API for ShareJS.
#
# The wire protocol is speccced out here:
# https://github.com/josephg/ShareJS/wiki/Wire-Protocol
#
# When a client connects the server first authenticates it and sends:
#
# S: {id:<agent session id>}
#
# After that, the client can open documents:
#
# C: {c:'users', doc:'fred', sub:true, snapshot:null, create:true, type:'text'}
# S: {c:'users', doc:'fred', sub:true, snapshot:{snapshot:'hi there', v:5, meta:{}}, create:false}
#
# ...
#
# The client can send open requests as soon as the socket has opened - it doesn't need to
# wait for its id.
#
# The wire protocol is documented here:
# https://github.com/josephg/ShareJS/wiki/Wire-Protocol

createAgent = require './agent'
hat = require 'hat'

# stream should expose the following interface:
#   headers
#   address
#   #abort()
#   #stop()
#   ready()
#   send(msg)
#   removeListener()
#   on(event, handler) - where event can be 'message' or 'closed'
module.exports = (options, stream) ->
  data =
    headers: stream.headers
    remoteAddress: stream.remoteAddress

  close = (err) ->
    # Close the stream for writing
    if err
      console.warn err
      stream.emit 'error', err
    stream.end()
    # ... and for reading.
    stream.emit 'close'
    stream.emit 'end'

  # This is the user agent through which a connecting client acts.
  # The agent is responsible for making sure client requests are properly authorized, and metadata is kept up to date.
  agent = null

  # To save on network traffic, the agent & server can leave out the docName with each message to mean
  # 'same as the last message'
  lastSentCollection = null
  lastSentDoc = null

  lastReceivedCollection = null
  lastReceivedDoc = null

  seq = 1

  # We need to track which documents are subscribed by the client. This is a map of
  # collection name -> {doc name: stream}
  collections = {}

  setSubscribed = (c, doc, value = true) ->
    docs = (collections[c] ||= {})
    docs[doc] = value

  isSubscribed = (c, doc) -> collections[c]?[doc]

  # Send a message to the socket.
  # msg _must_ have the c:Collection,doc:DocName properties set. We'll remove if they're the same as lastReceivedDoc.
  send = (response) ->
    if response.c is lastSentCollection and response.doc is lastSentDoc
      delete response.c
      delete response.doc
    else
      lastSentCollection = response.c
      lastSentDoc = response.doc

    # Its invalid to send a message to a closed stream. We'll silently drop messages if the
    # stream has closed.
    stream.write response

  # We'll only handle one message from each client at a time.
  handleMessage = (query, callback) ->
    console.log 'handleMessage', query

    error = null
    # + check collection
    error = 'Invalid docName' unless query.doc is null or typeof query.doc is 'string' or (query.doc is undefined and lastReceivedDoc)
    error = "'v' invalid" unless query.v is undefined or (typeof query.v is 'number' and query.v >= 0)
    error = 'invalid action' unless query.a is undefined or query.a in ['op', 'sub', 'unsub', 'fetch', 'q', 'qsub', 'qunsub']
    error = 'missing or invalid collection' if (query.doc or query.doc is null) and typeof query.c isnt 'string'

    if error
      console.warn "Invalid query #{query} from #{agent?.sessionId}: #{error}"
      #stream.emit 'error', error
      return callback error

    # The agent can specify null as the docName to get a random doc name.
    if query.doc is null
      lastReceivedCollection = query.c
      query.doc = lastReceivedDoc = hat()
    else if query.doc != undefined
      lastReceivedCollection = query.c
      lastReceivedDoc = query.doc
    else
      unless lastReceivedDoc and lastReceivedCollection
        console.warn "msg.doc or collection missing in query #{query} from #{agent.sessionId}"
        # The disconnect handler will be called when we do this, which will clean up the open docs.
        return callback 'c or doc missing'

      query.c = lastReceivedCollection
      query.doc = lastReceivedDoc

    switch query.a
      when 'fetch'
        agent.fetch query.c, query.doc, (err, data) ->
          return callback err if err
          callback null, v:data.v, snapshot:data.data

      when 'sub'
        collection = query.c
        doc = query.doc

        return callback null, error:'Already subscribed' if isSubscribed collection, doc
        setSubscribed collection, doc

        subscribeToStream = do (collection, doc) -> (opstream) ->
          opstream.on 'data', (data) ->
            msg =
              a: 'op'
              c: collection
              doc: doc
              v: data.v
              src: data.src
              seq: data.seq

            msg.op = data.op if data.op
            msg.create = data.create if data.create
            msg.del = true if data.del
  
            send msg

          # Stop listening to the stream after the session is closed
          stream.on 'finish', -> opstream.destroy()

        if query.v
          agent.subscribe collection, doc, query.v, (err, stream) ->
            if err
              setSubscribed collection, doc, false
              return callback err

            callback null, v:query.v
            subscribeToStream stream
        else
          agent.fetchAndSubscribe collection, doc, (err, data, stream) ->
            if err
              setSubscribed collection, doc, false
              return callback err

            # Send the snapshot separately. They should both end up on the wire together, but its
            # easier to process in the client this way.
            console.log 'want to subscribe user'
            send a:'data', c:collection, doc:doc, v:data.v, type:data.type, snapshot:data.data, meta:data.meta
            callback null, v:data.v
            subscribeToStream stream

      when 'op'
        # Shallow copy of just the op data parts.
        opData = {op:query.op, v:query.v, src:query.src, seq:query.seq}
        opData.create = query.create if query.create
        opData.del = query.del if query.del
        
        unless query.src
          opData.src = agent.sessionId
          opData.seq = seq++

        agent.submit query.c, query.doc, opData, (err, v) ->
          if err
            callback null, {a:'ack', error:err}
          else
            callback null, {a:'ack'}

      when 'q'
        agent.query query.c, query.q, (err, results) ->
          callback err if err
          
          id = query.id
          # Results.data contains the initial query result set
          callback null, id:id, data:results.data

          results.on 'add', (docName) ->
            send a:'q', id:id, add:docName
          results.on 'remove', (docName) ->
            send a:'q', id:id, rm:docName

      else
        console.warn 'invalid message', query
        callback 'invalid or unknown message'


  agent = createAgent options, stream
  stream.write a:'init', protocol:0, id:agent.sessionId

  do pump = ->
    query = stream.read()
    
    unless query
      stream.once 'readable', pump
      return

    # We've already authed successfully. Process the message.
    reply = (msg) ->
      msg.a = query.a unless msg.a
      msg.c = query.c
      msg.doc = query.doc
      send msg

    handleMessage query, (err, msg) ->
      return close err if err
      reply msg if msg
      pump()



