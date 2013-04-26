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

  # Map from query ID -> stream
  queries = {}


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
  handleMessage = (req, callback) ->
    #console.log 'handleMessage', req

    error = null
    # + check collection
    if req.a in ['qsub', 'qunsub']
      error = 'Missing query ID' unless typeof req.id is 'number'
    else
      error = 'Invalid docName' unless req.doc is undefined or typeof req.doc is 'string' or (req.doc is undefined and lastReceivedDoc)
      error = 'missing or invalid collection' if (req.doc or req.doc is null) and typeof req.c isnt 'string'

    error = 'invalid action' unless req.a is undefined or req.a in ['op', 'sub', 'unsub', 'fetch', 'qsub', 'qunsub']
    error = "'v' invalid" unless req.v is undefined or (typeof req.v is 'number' and req.v >= 0)

    if error
      console.warn "Invalid req ", req, " from #{agent?.sessionId}: #{error}"
      #stream.emit 'error', error
      return callback error

    # The agent can specify null as the docName to get a random doc name.
    if req.a not in ['qsub', 'qunsub']
      if req.doc is null
        lastReceivedCollection = req.c
        req.doc = lastReceivedDoc = hat()
      else if req.doc != undefined
        lastReceivedCollection = req.c
        lastReceivedDoc = req.doc
      else
        unless lastReceivedDoc and lastReceivedCollection
          console.warn "msg.doc or collection missing in req #{req} from #{agent.sessionId}"
          # The disconnect handler will be called when we do this, which will clean up the open docs.
          return callback 'c or doc missing'

        req.c = lastReceivedCollection
        req.doc = lastReceivedDoc

    switch req.a
      when 'fetch'
        agent.fetch req.c, req.doc, (err, data) ->
          return callback err if err
          callback null, v:data.v, snapshot:data.data

      when 'sub'
        collection = req.c
        doc = req.doc

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

        if req.v
          agent.subscribe collection, doc, req.v, (err, stream) ->
            if err
              setSubscribed collection, doc, false
              return callback err

            callback null, v:req.v
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
        opData = {op:req.op, v:req.v, src:req.src, seq:req.seq}
        opData.create = req.create if req.create
        opData.del = req.del if req.del
        
        unless req.src
          opData.src = agent.sessionId
          opData.seq = seq++

        agent.submit req.c, req.doc, opData, (err, v) ->
          if err
            callback null, {a:'ack', error:err}
          else
            callback null, {a:'ack'}

      when 'qsub'
        autoFetch = req.f
        agent.query req.c, req.q, (err, results) ->
          return callback err if err
          
          id = req.id
        
          return callback 'ID in use' if queries[id]

          queries[id] = results

          # Results.data contains the initial query result set
          for doc, data of results.data
            if autoFetch
              # The data object has the snapshot called 'data'. I need to make this consistent.
              data.snapshot = data.data
            delete data.data

          callback null, id:id, data:results.data

          results.on 'add', (docName) ->
            data = results.data[docName]
            data.doc = docName
            data.snapshot = data.data if autoFetch
            delete data.data
            send a:'q', id:id, add:data
          results.on 'remove', (docName) ->
            send a:'q', id:id, rm:docName

      when 'qunsub'
        id = req.id
        query = queries[id]
        if query
          query.destroy()
          delete queries[id]

        callback()

      else
        console.warn 'invalid message', req
        callback 'invalid or unknown message'


  agent = createAgent options, stream
  stream.write a:'init', protocol:0, id:agent.sessionId

  do pump = ->
    req = stream.read()
    
    unless req
      stream.once 'readable', pump
      return

    # We've already authed successfully. Process the message.
    reply = (err, msg) ->
      if err
        msg = {a:req.a, error:err}
      else
        msg.a = req.a unless msg.a

      msg.c = req.c if req.c
      msg.doc = req.doc if req.doc
      msg.id = req.id if req.id
      send msg

    handleMessage req, (err, msg) ->
      #return close err if err
      reply err, msg if err or msg
      pump()



