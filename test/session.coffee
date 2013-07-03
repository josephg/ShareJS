# These tests check that document requests make it to the backend (well, at
# least the useragent).

assert = require 'assert'
{Duplex, Readable} = require 'stream'
{EventEmitter} = require 'events'
ottypes = require 'ottypes'

createSession = require '../lib/server/session'
{Connection} = require '../lib/client'

describe 'session', ->
  beforeEach ->
    @serverStream = new Duplex objectMode:yes

    @userAgent =
      sessionId: 'session id' # The unique client ID
      fetchAndSubscribe: (collection, doc, callback) =>
        @subscribedCollection = collection
        @subscribedDoc = doc

        return callback @subscribeError if @subscribeError

        @opStream = new Readable objectMode:yes
        @opStream._read = ->
        callback null, {v:100, type:ottypes.text, data:'hi there'}, @opStream
      trigger: (a, b, c, d, callback) -> callback()

    @instance =
      createAgent: (stream) =>
        assert.strictEqual stream, @serverStream
        @userAgent

    @clientStream =
      send: (data) =>
        #console.log 'C->S', JSON.stringify data
        @serverStream.push data
      readyState: 0 # Connecting
      close: =>
        @serverStream.emit 'close'
        @serverStream.emit 'end'
        stream.end()

    @serverStream._write = (chunk, encoding, callback) =>
      #console.log 'S->C', JSON.stringify chunk
      @clientStream.onmessage? chunk
      callback()
    @serverStream._read = ->

    @connection = new Connection @clientStream

    @clientStream.readyState = 1 # Connected.
    @clientStream.onopen?()

    @session = createSession @instance, @serverStream

  describe 'connection maintenance', ->
    it 'connects', (done) ->
      checkStuff = =>
        assert.equal @connection.state, 'connected'
        assert.equal @connection.id, 'session id'
        done()

      if @connection.state is 'connected'
        checkStuff()
      else
        @connection.on 'connected', checkStuff

  describe 'document', ->
    describe 'subscribe', ->
      beforeEach ->

      it 'subscribes to a document', (done) ->
        doc = @connection.getOrCreate 'users', 'seph'
        assert.strictEqual doc.collection, 'users'
        assert.strictEqual doc.name, 'seph'
        assert.strictEqual doc.subscribed, false

        doc.subscribe (err) =>
          assert.equal err, null
          
          assert.equal doc.state, 'ready'
          assert doc.subscribed

          assert.deepEqual doc.snapshot, 'hi there'
          assert.strictEqual doc.version, 100
          assert.strictEqual doc.type, ottypes.text

          assert.strictEqual doc.name, @subscribedDoc
          assert.strictEqual doc.collection, @subscribedCollection

          done()

      it 'passes subscribe errors back to the client', (done) ->
        @subscribeError = 'You require more vespine gas'

        doc = @connection.getOrCreate 'users', 'seph'
        doc.subscribe (err) =>
          assert.equal err, @subscribeError

          assert.strictEqual doc.name, @subscribedDoc
          assert.strictEqual doc.collection, @subscribedCollection

          assert !doc.subscribed
          assert.equal doc.version, null
          assert.equal doc.type, null

          done()

    describe 'null document', ->
      it.skip 'lets you create', (done) ->
        doc = @connection.getOrCreate 'users', 'seph'
        doc.submitOp

    describe 'query', ->
      beforeEach ->


      it.only 'issues a query to the backend', (done) ->
        @userAgent.query = (index, query, opts, callback) ->
          assert.strictEqual index, 'index'
          assert.deepEqual query, {a:5, b:6}
          assert.deepEqual opts, {docMode:'fetch', poll:true, backend:'abc123', versions:{}}
          emitter = new EventEmitter()
          emitter.data = [{data:{x:10}, type:ottypes.text.uri, v:100, docName:'docname', c:'collection'}]
          emitter.extra = 'oh hi'
          callback null, emitter

        @connection.createSubscribeQuery 'index', {a:5, b:6}, {docMode:'fetch', poll:true, source:'abc123'}, (err, results, extra) ->
          assert.ifError err
          # Results should contain the single document that the query returned.
          assert.strictEqual results.length, 1
          assert.strictEqual results[0].name, 'docname'
          assert.strictEqual results[0].collection, 'collection'
          assert.deepEqual results[0].snapshot, {x:10}
          assert.strictEqual extra, 'oh hi'
          done()


      describe 'queryfetch', ->
        it 'does not subscribe to the query result set'

      it 'fetches query results if autoFetch option is passed'
      it 'does not fetch results which are subscribed by the client'
      it 'subscribes to documents if autosubscribe is true'
      it 'does not double subscribe to documents or anything wierd'
      it 'passes the right error message back if subscribe fails'





