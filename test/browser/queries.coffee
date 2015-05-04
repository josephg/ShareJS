assert = require 'assert'
{Connection} = require '../../lib/client'
createSocket = require '../helpers/socket.coffee'
createServer = require '../helpers/server.coffee'
createFixtures = require '../helpers/fixtures.coffee'

describe 'Queries', ->

  before ->
    @server = createServer()
    @fixtures = createFixtures()

  after (done) ->
    @fixtures.close()
    @server.close done

  beforeEach (done) ->
    @connection = new Connection(createSocket())
    @connection.get('cars', 'porsche').create 'text', 'red', =>
      @connection.get('cars', 'jaguar').create 'text', 'green', =>
        @connection.socket.close()
        @connection = new Connection(createSocket())
        done()

  afterEach (done) ->
    @connection.socket.close()
    @fixtures.reset done

  describe 'fetch', ->
    it 'returns documents', (done)->
      @connection.createFetchQuery 'cars', {}, {}, (error, documents)->
        assert.equal documents[0].name, 'porsche'
        assert.equal documents[1].name, 'jaguar'
        done()

    describe 'docMode: fetch', ->

      it 'returns documents with snapshots', (done)->
        @connection.createFetchQuery 'cars', {}, {docMode: 'fetch'}, (error, documents)->
          assert.equal documents[0].snapshot, 'red'
          assert.equal documents[1].snapshot, 'green'
          done()

      it 'populates connection documents', (done)->
        porsche = @connection.get('cars', 'porsche')
        assert.equal porsche.type, undefined
        assert.equal porsche.snapshot, undefined
        @connection.createFetchQuery 'cars', {}, {docMode: 'fetch'}, (error, documents)->
          assert.equal porsche.type.name, 'text'
          assert.equal porsche.snapshot, 'red'
          done()


  describe 'subscribe', ->

    it 'returns documents', (done)->
      @connection.createSubscribeQuery 'cars', {}, {}, (error, documents)->
        assert.equal documents[0].name, 'porsche'
        assert.equal documents[1].name, 'jaguar'
        done()

    it 'emits insert when creating document', (done)->
      query = @connection.createSubscribeQuery 'cars', {}, {}, ->
        query.on 'insert', ([document])->
          assert.equal document.name, 'panther'
          assert.equal document.snapshot, 'black'
          done()
        @connection.get('cars', 'panther').create 'text', 'black'

    it 'emits remove when deleting document', (done)->
      query = @connection.createSubscribeQuery 'cars', {}, {docMode: 'fetch'}, =>
        query.on 'remove', ([document])->
          assert.equal document.name, 'porsche'
          assert.equal document.snapshot, undefined
          done()
        @connection.get('cars', 'porsche').del()


  describe 'docMode: sub', ->
    beforeEach ->
      @anotherConnection = new Connection(createSocket())
    afterEach ->
      @anotherConnection.socket.close()

    it 'subscribes all result documents', (done)->
      @connection.createSubscribeQuery 'cars', {}, {docMode: 'sub'}, (error, [document]) =>
        document.on 'op', (operation)->
          assert.deepEqual operation, [3, 'y']
          done()
        porsche = @anotherConnection.get('cars', 'porsche')
        porsche.fetch -> porsche.submitOp [3, 'y']
