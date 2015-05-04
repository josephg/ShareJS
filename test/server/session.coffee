# Tests for the server session code.
#
# Most tests for this code should be in the session integration tests because
# testing the protocol directly means the tests have to change when the wire
# protocol changes.

assert = require 'assert'
{Duplex, Readable} = require 'stream'
{EventEmitter} = require 'events'
textType = require('ot-text').type

Session = require '../../lib/server/session'

describe.skip 'session', ->
  beforeEach ->
    @stream = new Duplex objectMode:yes

    @userAgent =
      sessionId: 'session id' # The unique client ID
      fetchAndSubscribe: (collection, doc, callback) =>
        @subscribedCollection = collection
        @subscribedDoc = doc

        return callback @subscribeError if @subscribeError

        @opStream = new Readable objectMode:yes
        @opStream._read = ->
        callback null, {v:100, type:textType, data:'hi there'}, @opStream
      trigger: (a, b, c, d, callback) -> callback()

    @instance =
      createAgent: (stream) =>
        assert.strictEqual stream, @stream
        @userAgent

    @send = (data) =>
      #console.log 'C->S', JSON.stringify data
      @stream.push data

    @stream._write = (chunk, encoding, callback) =>
      console.log 'S->C', JSON.stringify chunk
      @onmessage? chunk
      callback()
    @stream._read = ->

    # Let the test register an onmessage handler before creating the session.
    process.nextTick =>
      @session = new Session(@instance, @stream)

  afterEach ->
    @stream.emit 'close'
    @stream.emit 'end'
    @stream.end()

  # This is just a smoke test. Most of the tests for session should be done in
  # the session integration tests to allow the client-server API to change.
  it 'gives the client a session id', ->
    @onmessage = (msg) ->
      assert.deepEqual msg, a:'init', protocol:0, id:'session id'

