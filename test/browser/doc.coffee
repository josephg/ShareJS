assert = require 'assert'
sinon = require 'sinon'
createSocket = require '../helpers/socket.coffee'
createServer = require '../helpers/server.coffee'
createFixtures = require '../helpers/fixtures.coffee'

describe 'Doc', ->
  {Connection} = require('../../lib/client')

  before ->
    @connection = @alice = new Connection(createSocket())
    @bob = new Connection(createSocket())

    @alice.on 'error', (e) -> throw e
    @bob.on 'error', (e) -> throw e
    @server = createServer()
    @fixtures = createFixtures()

  after (done) ->
    @alice.socket.close()
    @bob.socket.close()
    @fixtures.close()
    @server.close done

  # Reset documents
  beforeEach ->
    @alice.collections = {}
    @bob.collections = {}

  describe '#create', ->
    afterEach (done) ->
      @fixtures.reset done

    it 'creates a document', (done) ->
      doc = @connection.get('garage', 'porsche')
      doc.create 'json0', {color: 'black'}, done

    it 'creates a document remotely data', (done) ->
      doc = @alice.get('garage', 'porsche')
      doc.create 'json0', {color: 'red'}, =>
        doc2 = @bob.get('garage', 'porsche')
        doc2.fetch (error) ->
          assert.deepEqual doc2.snapshot, color: 'red'
          done(error)

    it 'triggers created', (done) ->
      doc = @alice.get('garage', 'jaguar')
      oncreate = sinon.spy()
      doc.on 'create', oncreate
      doc.create 'json0', {color: 'british racing green'}, ->
        sinon.assert.calledOnce oncreate
        done()

    it 'sets state floating', (done) ->
      doc = @alice.get('garage', 'porsche')
      assert.equal doc.state, null
      doc.create 'json0', {color: 'white'}, done
      assert.equal doc.state, 'floating'

    it 'sets state ready on success', (done) ->
      doc = @alice.get('garage', 'porsche')
      assert.equal doc.state, null
      doc.create 'json0', {color: 'rose'}, (error) ->
        assert.equal doc.state, 'ready'
        done(error)


  describe '#del', ->
    afterEach (done) ->
      @fixtures.reset done

    it 'deletes doc remotely', (done) ->
      doc = @alice.get('garage', 'porsche')
      doc.create 'json0', {color: 'beige'}, false, =>
        doc.del false, =>
          doc2 = @bob.get('garage', 'porsche')
          doc2.fetch (error) ->
            assert.equal doc2.type, undefined
            assert.equal doc2.snapshot, undefined
            done(error)


  describe '#destroy', ->
    afterEach (done) ->
      @fixtures.reset done

    it 'removes doc from cache', ->
      doc = @alice.get('garage', 'porsche')
      assert.equal @alice.get('garage', 'porsche'), doc
      doc.destroy()
      assert.notEqual @alice.get('garage', 'porsche')

  describe '#submitOp', ->
    afterEach (done) ->
      @fixtures.reset done

    beforeEach (done) ->
      @doc = @alice.get('songs', 'dedododo')
      @doc.create 'text', '', false, done

    it 'applies operation locally', (done) ->
      @doc.submitOp ['dedadada'], false, =>
        assert.equal @doc.snapshot, 'dedadada'
        done()

    it 'applies operation remotely', (done) ->
      @doc.submitOp ['dont think'], false, =>
        doc2 = @bob.get('songs', 'dedododo')
        doc2.fetch (error) ->
          assert.equal doc2.snapshot, 'dont think'
          done(error)
