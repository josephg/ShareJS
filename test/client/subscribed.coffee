createSocket = require '../helpers/socket.coffee'

describe 'Subscribed Document', ->
  assert = require 'assert'
  {Connection} = require '../../lib/client'
  require '../../lib/types'
  ottypes = require 'ottypes'

  connections = {}

  before ->
    connections.alice = new Connection(createSocket())
    connections.bob =   new Connection(createSocket())

  after ->
    for name, connection of connections
      connection.socket.close()
      delete connections[name]

  fixtures = require('../helpers/fixtures.coffee')()

  beforeEach (done)->
    fixtures.reset(done)
    for name, connection of connections
      connection.collections = {}


  beforeEach (done)->
    @docs = {}
    for name, connection of connections
      @docs[name] = connection.get('poems', 'lorelay')

    @docs.alice.subscribe =>
      @docs.bob.subscribe(done)

  afterEach (done)->
    @docs.alice.unsubscribe =>
      @docs.bob.unsubscribe(done)


  describe 'shared create', ->

    it 'triggers create', (done)->
      @docs.bob.on 'create', =>
        done()
      @docs.alice.create 'text', 'ich', =>

    it 'sets type', (done)->
      @docs.alice.on 'create', =>
        assert.equal @docs.alice.type, ottypes['text']
        done()
      @docs.bob.create('text', 'ich')

    it 'sets initial snapshot', (done)->
      @docs.bob.on 'create', =>
        assert.equal @docs.bob.snapshot, 'ich'
        done()
      @docs.alice.create('text', 'ich')

  describe 'when created', ->

    beforeEach (done)->
      @docs.alice.create('text', 'ich')
      @docs.bob.on 'create', -> done()

    it 'shares del', (done)->
      @docs.bob.on 'del', -> done()
      @docs.alice.del()


    describe 'editing context', ->

      beforeEach ->
        @alice = @docs.alice.createContext()
        @bob   = @docs.bob.createContext()

      it 'shares insert', (done)->
        @bob.onInsert = (pos, text)->
          assert.equal pos, 3
          assert.equal text, ' weiss'
          assert.equal @getSnapshot(), 'ich weiss'
          done()
        @alice.insert(3, ' weiss')

      it 'shares remove', (done)->
        @alice.onRemove = (pos, length)->
          assert.equal pos, 1
          assert.equal length, 1
          assert.equal @getSnapshot(), 'ih'
          done()
        @bob.remove(1, 1)
