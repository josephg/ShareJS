assert = require 'assert'

describe 'Connection', ->

  {Connection} = require('share')
  {BCSocket} = require('bcsocket')

  describe 'connecting', ->

    it 'connects socket', (done)->
      socket = new BCSocket
      socket.close()
      connection = new Connection(socket)
      connection.on 'connecting', -> done()
      socket.open()

    it 'connects to sharejs', (done)->
      socket = new BCSocket
      connection = new Connection(socket)
      connection.on 'connected', -> done()
    

  describe '#get', ->

    before ->
      socket = new BCSocket
      @connection = new Connection(socket)

    it 'returns a document', ->
      Doc = require('share').Doc
      doc = @connection.get('cars', 'porsche')
      assert.equal doc.constructor, Doc

    it 'always returns the same document', ->
      doc1 = @connection.get('cars', 'porsche')
      doc2 = @connection.get('cars', 'porsche')
      assert.equal doc1, doc2
