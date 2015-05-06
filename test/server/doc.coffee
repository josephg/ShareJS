{expect} = require 'chai'
{Connection} = require '../../lib/client'
{Doc}    = require '../../lib/client/doc'
textType = require('ot-text').type

describe 'Doc', ->

  numberType = require('../helpers/ot_number')

  createConnection = ->
    socket = {}
    connection = new Connection(socket)
    connection.id = '42'
    connection.state = 'connected'
    connection.canSend = true
    connection.sent = []
    connection.sendBackTo = null
    connection.send = (data) ->
      if @sendBackTo
        @sendBackTo._onMessage data
      else
        @sent.push data
    return connection

  beforeEach ->
    @connection = createConnection()
    @doc = new Doc(@connection, 'notes', 'music')

  # Call this in a group to work with a created document
  beforeEachCreateDocument = ->
    beforeEach ->
      # Mirror message right back to doc
      @connection.sendBackTo = @doc
      @doc.create numberType, 1
      # Flush forces the doc to send immediately instead of async
      @doc.flush()
      @connection.sendBackTo = null

  describe '#subscribe', ->

    it 'sets subscribed', (done)->
      expect(@doc.subscribed).to.be.false
      @doc.subscribe =>
        expect(@doc.subscribed).to.be.true
        done()
      @doc._onMessage {c: 'notes', d: 'music', a: 'sub'}

    it 'emits subscribe', (done)->
      @doc.subscribe()
      @doc.on('subscribe', done)
      @doc._onMessage {c: 'notes', d: 'music', a: 'sub'}

    it 'sends subscription message', ->
      @doc.subscribe()
      expect(@connection.sent[0].c).to.equal 'notes'
      expect(@connection.sent[0].d).to.equal 'music'
      expect(@connection.sent[0].a).to.equal 'sub'

    it 'retrives snapshot', ->
      @doc.subscribe()
      expect(@doc.snapshot).to.be.undefined
      @doc._onMessage
        c: 'notes'
        d: 'music'
        a: 'sub'
        data:
          {data: 'snapshot', v: 0, type: 'text'}
      expect(@doc.snapshot).to.equal 'snapshot'


  describe '#unsubscribe', ->

    beforeEach -> @doc.subscribed = true

    it 'sets unsubscribed', (done)->
      expect(@doc.subscribed).to.be.true
      @doc.unsubscribe =>
        expect(@doc.subscribed).to.be.false
        done()
      @doc._onMessage {c: 'notes', d: 'music', a: 'unsub'}

    it 'emits unsubscribe', (done)->
      @doc.on('unsubscribe', done)
      @doc._onMessage {c: 'notes', d: 'music', a: 'unsub'}

    it 'sends unsubscription message', ->
      @doc.unsubscribe()
      expect(@connection.sent[0]).to.deep.equal {c: 'notes', d: 'music', a: 'unsub'}

    it 'calls subscribe callbacks', (done)->
      @doc.subscribe(done)
      @doc.unsubscribe()
      @doc._onMessage {c: 'notes', d: 'music', a: 'unsub'}


  describe '#fetch', ->

    it 'sends fetch message', ->
      @doc.fetch()
      expect(@connection.sent[0]).to.deep.equal {c: 'notes', d: 'music', a: 'fetch'}

    it 'sets snapshot', ->
      @doc.fetch()
      @doc._onMessage {c: 'notes', d: 'music', a: 'fetch', data: { data: 'cool' , v: 0, type: 'text'}}
      expect(@doc.snapshot).to.equal 'cool'

    it 'gets ready', (done)->
      @doc.fetch()
      @doc.on 'ready', =>
        expect(@doc.state).to.equal 'ready'
        done()
      @doc._onMessage {c: 'notes', d: 'music', a: 'fetch', data: { data: 'cool' , v: 0}}

    it 'fetches ops when we have data'

    it 'just calls the callback when we are subscribed'

    it 'calls all callbacks when fetch is called multiple times'

  describe '#create', ->

    it 'calls callback', (done)->
      @connection.sendBackTo = @doc
      @doc.create textType, done

    it 'sends create message', ->
      @doc.create(textType)
      @doc.flush()
      expect(@connection.sent[0]).to.have.property('create')

    it 'immediately injests data locally', ->
      @doc.create(textType, 'a note on music')
      expect(@doc.snapshot).to.equal 'a note on music'

    it 'injests data on success', ->
      @connection.sendBackTo = @doc
      @doc.create(textType, 'a note on music')
      @doc.flush()
      expect(@doc.snapshot).to.equal 'a note on music'

    it 'gets ready', (done)->
      @connection.sendBackTo = @doc
      expect(@doc.state).to.be.null
      @doc.create(textType, 'a note on music')
      @doc.flush()
      @doc.on 'ready', =>
        expect(@doc.state).to.equal 'ready'
        done()

    it 'emits create after snapshot created', (done)->
      @doc.once 'create', =>
        expect(@doc.snapshot).to.equal 'Love The Police'
        done()
      @doc.create(textType, 'Love The Police')


  describe '#del', ->

    beforeEachCreateDocument()

    it 'sends del message', ->
      @doc.del()
      @doc.flush()
      expect(@connection.sent[0]).to.have.property('del')

    it 'unsets type', ->
      @doc.del()
      expect(@doc.type).to.be.null

    it 'emits del after unsetting type', (done)->
      @doc.once 'del', =>
        expect(@doc.type).to.be.null
        done()
      @doc.del()


  describe 'subscribe unsubscribe and fetch', ->
    it 'subscribes once and calls all callbacks when subscribe is called multiple times'
    it 'unsubscribes once and calls all callbacks when unsubscribe is called multiple times'
    it 'hydrates the document if you call getOrCreate() with no data followed by getOrCreate() with data'


  describe 'editing contexts', ->

    beforeEach ->
      @connection.sendBackTo = @doc
      @doc.create(textType, 'note')
      @doc.flush()
      @context = @doc.createContext()

    it '#get exposes data', ->
      expect(@context.get()).to.equal 'note'

    it 'changes snapshot locally', ->
      @context.insert(0, 'delicious ')
      expect(@doc.snapshot).to.equal 'delicious note'

      @doc.flush()
      expect(@doc.snapshot).to.equal 'delicious note'

    it 'changes context data', ->
      @context.insert(0, 'delicious ')
      @doc.flush()
      expect(@context.get()).to.equal 'delicious note'

    it 'can call removeContexts', ->
      @doc.removeContexts()


  describe 'rollback', ->

    describe 'create', ->

      it 'resets floating state', ->
        @doc.create textType, 'a note on music'
        @doc.flush()
        expect(@doc.state).to.equal 'floating'
        @doc._onMessage {c: 'notes', d: 'music', a: 'ack', error: 'rejected'}
        expect(@doc.state).to.be.null

      it "when we're ready and the server rejects the op"

      it "when the doc is floating and the document already exists on the server"

    describe 'operation', ->

      beforeEachCreateDocument()

      beforeEach ->
        @context = @doc.createContext()
      afterEach ->
        @doc.removeContexts()

      it 'applies inverse', ->
        @context.add(2)
        @doc.flush()
        expect(@context.get()).to.equal 3

        msg = @connection.sent.pop()
        msg.error = 'rejected'
        msg.a = 'ack'
        @doc._onMessage msg
        expect(@context.get()).to.equal 1


    it 'ends up in the right state if we create() then subscribe() synchronously'
    it "abandons the document state if we can't recover from the rejected op"

  describe 'after op event', ->

    beforeEachCreateDocument()

    it 'is triggered when submitting operation', (done)->
      @doc.on('after op', -> done())
      @doc.submitOp(-2)

    it 'is triggered after applying operation', (done)->
      expect(@doc.snapshot).to.equal 1
      @doc.on 'after op', =>
        expect(@doc.snapshot).to.equal 0
        done()
      @doc.submitOp(-1)

    it 'sends operations in correct order', (done)->
      @doc.once 'after op', =>
        @doc.submitOp(1)
        @doc.flush()
        expect(@connection.sent[0].op).to.equal -1
        done()
      @doc.submitOp(-1)

  describe 'after op event', ->

    beforeEachCreateDocument()

    it 'is triggered when submitting operation', (done)->
      @doc.on('before op', -> done())
      @doc.submitOp(-2)

    it 'is triggered before applying operation', (done)->
      expect(@doc.snapshot).to.equal 1
      @doc.on 'before op', =>
        expect(@doc.snapshot).to.equal 1
        done()
      @doc.submitOp(-1)

    it 'is triggered when document is locked', (done)->
      @doc.once 'before op', =>
        expect(@doc.locked).to.be.true
        done()
      @doc.submitOp(-1)


  describe 'ops', ->
    it 'sends an op to the server'
    it 'deletes a document'
    it 'only sends one op to the server if ops are sent synchronously'
    it 'reorders sent (but not acknowledged) operations on reconnect'
