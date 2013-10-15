assert = require 'assert'


describe 'Connection', ->
  # Disable Timeouts becaue the connection can take ages. Not sure why
  @timeout(0)

  share = require('../../lib/client')
  Connection = share.Connection
  {BCSocket} = require('browserchannel/dist/bcsocket')

  describe 'connecting', ->
    it 'connects socket', (done)->
      socket = new BCSocket
      socket.close()
      connection = new Connection(socket)
      connection.on 'connecting', ->
        socket.close()
        done()
      socket.open()

    it 'connects to sharejs', (done)->
      socket = new BCSocket
      connection = new Connection(socket)
      connection.on 'connected', ->
        socket.close()
        done()


  describe '#get', ->

    before ->
      socket = new BCSocket
      @connection = new Connection(socket)

    after ->
      @connection.socket.close()
      delete @connection

    it 'returns a document', ->
      Doc = share.Doc
      doc = @connection.get('cars', 'porsche')
      assert.equal doc.constructor, Doc

    it 'always returns the same document', ->
      doc1 = @connection.get('cars', 'porsche')
      doc2 = @connection.get('cars', 'porsche')
      assert.equal doc1, doc2
