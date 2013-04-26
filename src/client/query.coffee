# Queries are live requests to the database for particular sets of fields.
#
# The server actively tells the client when there's new data that matches
# a set of conditions.

class Query
  # The query object is the actual query passed to mongo.
  constructor: (@connection, @id, @collection, @query) ->
    @data = {}
    @autoFetch = false

    # Do we automatically subscribe when we reconnect?
    @autoSubscribe = false
    @ready = false

  whenReady: (fn) ->
    if @ready then fn() else @on 'ready', fn

  _onMessage: (msg) ->
    if msg.error
      @emit 'error', msg.error

    else if msg.data
      # Remove anything currently in data.
      for name of @data when !msg.data[name]
        @emit 'removed', @data[name]
        delete @data[name]

      for name, data of msg.data when !@data[name]
        doc = @data[name] = @connection.getOrCreate @collection, name, data
        @emit 'added', doc

      if !@ready
        @emit 'ready', msg.data
        @ready = true

    else if msg.add
      #console.log 'add', msg.add
      data = msg.add
      doc = @data[data.doc] = @connection.getOrCreate @collection, data.doc, data
      @emit 'added', doc

    else if msg.rm
      #console.log 'remove', msg.rm
      @emit 'removed', @data[msg.rm]
      delete @data[msg.rm]

  subscribe: ->
    @autoSubscribe = true
    if @connection.canSend
      @connection.send a:'qsub', c:@collection, f:@autoFetch, id:@id, q:@query

  unsubscribe: ->
    @autoSubscribe = false
    if @connection.canSend
      @connection.send a:'qunsub', id:@id

  # You should unsubscribe the query before calling destroy.
  destroy: ->
    @connection.destroyQuery this

  _onConnectionStateChanged: (state, reason) ->
    @subscribe() if @connection.state is 'connecting' and @autoSubscribe

MicroEvent.mixin Query

