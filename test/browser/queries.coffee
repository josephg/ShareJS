assert = require 'assert'
{Connection} = require '../../lib/client'

createSocket = require '../helpers/socket.coffee'
Server = require '../helpers/server.coffee'
Fixtures = require '../helpers/fixtures.coffee'

describe 'Queries', ->

  before ->
    @connection = new Connection(createSocket())
    @server = Server()
    @fixtures = Fixtures()

  after (done) ->
    @fixtures.close()
    delete @fixtures
    @connection.socket.close()
    delete @connection
    @server.close done


  beforeEach (done) ->
    @connection.get('cars', 'porsche').create 'text', 'red', =>
      @connection.get('cars', 'jaguar').create 'text', 'green', =>
        @connection.collections = {}
        done()

  afterEach (done) ->
    @connection.collections = {}
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
      query = @connection.createSubscribeQuery 'cars', {}, {}
      query.on 'insert', ([document])->
        assert.equal document.snapshot, 'black'
        done()
      @connection.get('cars', 'panther').create 'text', 'black'

    # FIXME as soon as upstream bug is fixed
    # https://github.com/share/livedb/pull/11
    it.skip 'emits remove when deleting document', (done)->
      query = @connection.createSubscribeQuery 'cars', {}, {}
      query.on 'remove', ([document])->
        assert.equal document.snapshot, 'black'
        done()
      @connection.get('cars', 'porsche').del()


  describe 'docMode: sub', ->
    before -> @anotherConnection = new Connection(createSocket())
    after  -> @anotherConnection.socket.close()
    beforeEach -> @anotherConnection.collections = {}

    it 'subscribes all result documents', (done)->
      @connection.createSubscribeQuery 'cars', {}, {docMode: 'sub'}
      , (error, [document])=>
        document.on 'op', (operation)->
          assert.deepEqual operation, [3, 'y']
          done()
        porsche = @anotherConnection.get('cars', 'porsche')
        porsche.fetch -> porsche.submitOp [3, 'y']
