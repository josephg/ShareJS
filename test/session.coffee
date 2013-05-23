# These tests check that document requests make it to the backend (well, at
# least the useragent).

assert = require 'assert'
{Duplex, Readable} = require 'stream'
ottypes = require 'ottypes'

createSession = require '../src/server/session'
{Connection} = require '../src/client'

describe 'session', ->
  beforeEach ->
    @serverStream = new Duplex objectMode:yes

    @userAgent =
      sessionId: 'session id' # The unique client ID

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
      it 'subscribes to a document', (done) ->
        @userAgent.fetchAndSubscribe = (collection, doc, callback) ->
          console.log 'sdf'
          assert.equal collection, 'users'
          assert.equal doc, 'seph'

          stream = new Readable objectMode:yes
          stream._read = ->
          
          callback null, {v:100, type:ottypes.text, data:'hi there'}, stream

        doc = @connection.getOrCreate 'users', 'seph'
        assert.strictEqual doc.collection, 'users'
        assert.strictEqual doc.name, 'seph'
        assert.strictEqual doc.subscribed, false

        doc.subscribe()

        doc.whenReady ->
          assert.deepEqual doc.snapshot, 'hi there'
          assert.strictEqual doc.version, 100
          assert.strictEqual doc.type, ottypes.text

          done()
          #console.log doc

      it 'passes subscribe errors back to the client', ->

