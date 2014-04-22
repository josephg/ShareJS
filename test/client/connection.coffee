# Load Dependencies
chai = require 'chai'
chai.use require 'sinon-chai'
expect = chai.expect
sinon = require 'sinon'

createSocket = require '../helpers/socket.coffee'
Server = require '../helpers/server.coffee'


delay = (done) -> setTimeout done, 100

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
      @connection = new Connection(createSocket())

    after ->
      @connection.socket.close()
      delete @connection

    it 'returns a document', ->
      Doc = share.Doc
      doc = @connection.get('cars', 'porsche')
      expect(doc.constructor).to.be.eql Doc

    it 'always returns the same document', ->
      doc1 = @connection.get('cars', 'porsche')
      doc2 = @connection.get('cars', 'porsche')
      expect(doc1).to.be.eql doc2

  describe 'bulk subscribe', ->

    before ->
      @connection = new Connection(createSocket(null, reconnect: true))

    after ->
      @connection.socket.close()
      delete @connection


    it.skip 'uses bulk subscribe when reconnecting and subscribed to multiple docs', (done) ->
      firstDoc = @connection.get 'hello', 'first'
      secondDoc = @connection.get 'hello', 'second'

      restart = (cb) =>
        @server.kill => delay =>
          delete @server
          @server = Server()
          @connection.socket.open()
        @connection.on 'connected', cb

      firstDoc.subscribe => secondDoc.subscribe =>
        createHandler = (finished) =>
          expect(@connection.send).to.have.been.calledWith
            a: 'bs'
            s: {hello: {second: null}}

          insert = (cb) ->
            ctx = firstDoc.createContext()
            expect(ctx.getSnapshot()).to.be.eql 'new'
            ctx.insert 3, ' stuff', (err) ->
              throw err if err
              expect(ctx.getSnapshot()).to.be.eql 'new stuff'
              ctx.destroy()
              cb()

          assertPresence = (cb) ->
            ctx = firstDoc.createContext()
            expect(ctx.getPresence()).to.be.eql {'_selection': [0, 4]}
            ctx.destroy()
            cb()

          # Ensure we can create and modify docs
          insert => assertPresence =>
            @connection.send.restore()
            finished()

        setPresence = (cb) ->
          firstDoc.onPresence = ->
            expect(firstDoc.presence).to.be.eql {'_selection': [0, 4]}
            cb()

          ctx = firstDoc.createContext()
          ctx.setSelection [0,4]
          ctx.destroy()

        sinon.spy @connection, 'send'

        firstDoc.on 'create', =>
          setPresence => restart => createHandler done

        firstDoc.create 'text', 'new'
