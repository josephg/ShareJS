createSocket = require '../helpers/socket.coffee'
assert = require 'assert'
{Connection} = require '../../lib/client'
createServer = require '../helpers/server.coffee'
createFixtures = require '../helpers/fixtures.coffee'

describe 'Subscribed Document', ->

  before ->
    @alice = new Connection(createSocket())
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
  beforeEach (done) ->
    @alice.collections = {}
    @bob.collections = {}

    @docs = {}
    @docs.alice = @alice.get 'poems', 'lorelay'
    @docs.bob = @bob.get 'poems', 'lorelay'
    @docs.alice.subscribe => @docs.bob.subscribe done

  afterEach (done) ->
    @docs.alice.unsubscribe => @docs.bob.unsubscribe done

  describe 'shared create', ->
    afterEach (done) -> @fixtures.reset done

    it 'triggers create', (done) ->
      @docs.bob.on 'create', -> done()
      @docs.alice.create 'text', 'ich'

    it 'sets type', (done) ->
      @docs.alice.on 'create', =>
        assert.equal @docs.alice.type, require('ot-text').type
        done()
      @docs.bob.create 'text', 'ich'

    it 'sets initial snapshot', (done)->
      @docs.bob.on 'create', =>
        assert.equal @docs.bob.snapshot, 'ich'
        done()
      @docs.alice.create 'text', 'ich'

  describe 'when created', ->

    beforeEach (done) ->
      @docs.bob.on 'create', -> done()
      @docs.alice.create 'text', 'ich'

    it 'shares del', (done) ->
      @docs.bob.on 'del', =>
        @fixtures.reset done
      @docs.alice.del()

    describe 'editing context', ->

      beforeEach ->
        @aliceCtx = @docs.alice.createContext()
        @bobCtx   = @docs.bob.createContext()

      it 'shares insert', (done) ->
        @bobCtx.onInsert = (pos, text) =>
          assert.equal pos, 3
          assert.equal text, ' weiss'
          assert.equal @bobCtx.getSnapshot(), 'ich weiss'
          @fixtures.reset done
        @aliceCtx.insert(3, ' weiss')

      it 'shares remove', (done) ->
        @aliceCtx.onRemove = (pos, length) =>
          assert.equal pos, 1
          assert.equal length, 1
          assert.equal @aliceCtx.getSnapshot(), 'ih'
          @fixtures.reset done
        @bobCtx.remove(1, 1)
