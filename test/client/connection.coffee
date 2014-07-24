# Connection class tests
#
# This file contains tests for the code in client/connection.js.

assert = require 'assert'
{Connection, Doc} = require('../../lib').client

describe 'Connection', ->
  beforeEach ->
    @socket =
      readyState: 0
      send: ->
      open: (event) ->
        @readyState = 1
        @onopen? event
      close: (reason) ->
        @readyState = 3
        @onclose? {code:1000, reason, wasClean:true}
      error: (event) ->
        @onerror? event

    @connection = new Connection @socket

  it 'emits an error if the protocol version is not 1', (done) ->
    connection = new Connection @socket
    connection.on 'error', (error) ->
      assert.equal error.message, 'Invalid protocol version'
      done()

    @socket.onmessage {data:{a:'init', protocol:2, id:'session id'}}


  describe 'lifecycle events', ->
    describe 'initial connection state', ->
      it 'is disconnected if the socket is CONNECTING, CLOSING or CLOSED', ->
        for readyState in [0, 2, 3] # CONNECTING, CLOSING, CLOSED
          @socket.readyState = readyState
          connection = new Connection @socket
          assert.equal connection.state, 'disconnected'

      it 'is connecting if the socket is OPEN', ->
        @socket.open()
        connection = new Connection @socket
        assert.equal connection.state, 'connecting'

      it 'is connecting if the socket can send during connecting phase', ->
        @socket.canSendWhileConnecting = true
        connection = new Connection @socket
        assert.equal connection.state, 'connecting'        

    it 'emits events and changes state as the socket does stuff', ->
      connection = new Connection @socket
      lastEvent = null
      for e in ['connecting', 'connected', 'disconnected']
        do (e) -> connection.on e, -> lastEvent = e

      checkState = (s) ->
        assert.equal lastEvent, s
        assert.equal connection.state, s

      @socket.open()
      checkState 'connecting'
      @socket.onmessage {data:{a:'init', protocol:1, id:'session id'}}
      checkState 'connected'
      @socket.close()
      checkState 'disconnected'

      @socket.open()
      checkState 'connecting'

    it 'forwards events from the socket to the user', (done) ->
      @connection.once 'socket open', (event) =>
        assert.equal event, 'open event'
        @connection.once 'socket error', (event) =>
          assert.equal event, 'error event'
          @connection.once 'socket close', (event) =>
            assert.equal event.reason, 'close reason'
            done()

          @socket.close 'close reason'
        @socket.error 'error event'
      @socket.open 'open event'


  describe 'get doc', ->

    it 'returns a Doc', ->
      doc = @connection.get('food', 'steak')
      assert.equal doc.constructor, Doc

    it 'returns the same object the second time', ->
      first = @connection.get('food', 'steak')
      second = @connection.get('food', 'steak')
      assert.equal first, second

    it 'injests data on creation', ->
      doc = @connection.get('food', 'steak', data: 'content', v: 0)
      assert.equal doc.snapshot, 'content'
      doc = @connection.get('food', 'steak', data: 'other content', v: 0)
      assert.equal doc.snapshot, 'content'
