assert = require 'assert'
createSocket = require '../helpers/socket.coffee'
Server = require '../helpers/server.coffee'


describe 'Connection', ->
  share = require('../../lib/client')
  Connection = share.Connection
  before ->
    @server = Server()
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
      delete @connection

    it 'returns a document', ->
      Doc = share.Doc
      doc = @connection.get('cars', 'porsche')
      assert.equal doc.constructor, Doc

    it 'always returns the same document', ->
      doc1 = @connection.get('cars', 'porsche')
      doc2 = @connection.get('cars', 'porsche')
      assert.equal doc1, doc2
