assert = require 'assert'
createServer = require '../helpers/server.coffee'
createSocket = require '../helpers/socket.coffee'


describe 'Connection', ->
  share = require('../../lib/client')
  Connection = share.Connection

  before ->
    @server = createServer()
  after (done) ->
    @server.close done

  describe 'connecting', ->
    it 'connects socket', (done)->
      socket = createSocket()
      socket.close()
      connection = new Connection(socket)
      connection.on 'connecting', ->
        socket.close()
        done()
      socket.open()

    it 'connects to sharejs', (done)->
      socket = createSocket()
      connection = new Connection(socket)
      connection.on 'connected', ->
        socket.close()
        done()


  describe '#get', ->

    before ->
      socket = createSocket()
      @connection = new Connection(socket)

    after ->
      @connection.socket.close()

    it 'returns a document', ->
      Doc = share.Doc
      doc = @connection.get('cars', 'porsche')
      assert.equal doc.constructor, Doc

    it 'always returns the same document', ->
      doc1 = @connection.get('cars', 'porsche')
      doc2 = @connection.get('cars', 'porsche')
      assert.equal doc1, doc2
