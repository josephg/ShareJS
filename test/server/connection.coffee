sinon  = require 'sinon'
assert = require 'assert'
{Connection} = require '../../lib/client'
{Doc} = require '../../lib/client/doc'


describe 'Connection', ->

  socket = {
    send: ->
    connect: ->
      @readyState = 1
      @onopen?()
    close: ->
      @readyState = 3
      @onclose?()
  }


  beforeEach ->
    socket.readyState = 0
    @connection = new Connection socket


  describe 'state and socket', ->

    it 'is set to disconnected', ->
      socket.readyState = 3
      connection = new Connection socket
      assert.equal connection.state, 'disconnected'

    it 'is set to connecting', ->
      socket.readyState = 1
      connection = new Connection socket
      assert.equal connection.state, 'connecting'


  describe 'socket onopen', ->

    beforeEach ->
      socket.readyState = 3
      @connection = new Connection socket

    it 'sets connecting state', ->
      assert.equal @connection.state, 'disconnected'
      socket.onopen()
      assert.equal @connection.state, 'connecting'

    it 'sets canSend', ->
      assert !@connection.canSend
      socket.onopen()
      assert @connection.canSend


  describe 'socket onclose', ->

    it 'sets disconnected state', ->
      assert.equal @connection.state, 'connecting'
      socket.close()
      assert.equal @connection.state, 'disconnected'

    it 'sets canSend', ->
      assert @connection.canSend
      socket.close()
      assert !@connection.canSend


  describe 'socket onmessage', ->
    msg = {d: 'doc'}
    beforeEach ->
      sinon.stub(@connection, 'handleMessage')

    it 'calls handle message', ->
      socket.onmessage({data: JSON.stringify(msg)})
      sinon.assert.calledWith @connection.handleMessage, msg

    it 'pushes message buffer', ->
      assert @connection.messageBuffer.length == 0
      socket.onmessage(data: JSON.stringify(msg))
      assert @connection.messageBuffer.length == 1

    it 'handles string messages', ->
      socket.onmessage({data: 'a message'})
      sinon.assert.calledWith @connection.handleMessage, 'a message'



  describe '#disconnect', ->

    it 'calls socket.close()', ->
      close = sinon.spy socket, 'close'
      @connection.disconnect()
      sinon.assert.calledOnce close
      close.reset()

    it 'emits disconnected', ->
      emit = sinon.spy @connection, 'emit'
      @connection.disconnect()
      sinon.assert.calledWith emit, 'disconnected'
      emit.reset()


  describe '#get', ->

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
