# These tests check that document requests make it to the backend (well, at
# least the useragent).

assert = require 'assert'
{Duplex, Readable} = require 'stream'
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





