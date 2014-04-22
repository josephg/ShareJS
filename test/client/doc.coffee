chai = require 'chai'
chai.use require 'sinon-chai'
expect = chai.expect
sinon = require 'sinon'

ottypes = require 'ottypes'
{Connection} = require '../../lib/client'

createSocket = require '../helpers/socket.coffee'
Server = require '../helpers/server.coffee'
Fixtures = require '../helpers/fixtures.coffee'


describe 'Doc', ->

  before ->
    @connection = @alice = new Connection(createSocket())
    @bob = new Connection(createSocket())

    @alice.on 'error', (e) -> throw e
    @bob.on 'error', (e) -> throw e
    @server = Server()
    @fixtures = Fixtures()

  after (done) ->
    @alice.socket.close()
    delete @alice
    @bob.socket.close()
    delete @bob
    @fixtures.close()
    delete @fixtures
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
          throw error if error
          expect(doc2.snapshot).to.be.eql(color: 'red')
          done()

    it 'triggers created', (done) ->
      doc = @alice.get('garage', 'jaguar')
      oncreate = sinon.spy()
      doc.on 'create', oncreate
      doc.create 'json0', {color: 'british racing green'}, ->
        expect(oncreate).to.have.been.calledOnce
        done()

    it 'sets state floating', (done) ->
      doc = @alice.get('garage', 'porsche')
      expect(doc.state).to.be.eql null
      doc.create 'json0', {color: 'white'}, done
      expect(doc.state).to.be.eql 'floating'

    it 'sets state ready on success', (done) ->
      doc = @alice.get('garage', 'porsche')
      expect(doc.state).to.be.eql null
      doc.create 'json0', {color: 'rose'}, (error) ->
        expect(doc.state).to.be.eql 'ready'
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
            expect(doc2.type).to.be.eql undefined
            expect(doc2.snapshot).to.be.eql undefined
            done(error)


  describe '#destroy', ->
    afterEach (done) ->
      @fixtures.reset done

    it 'removes doc from cache', ->
      doc = @alice.get('garage', 'porsche')
      expect(@alice.get 'garage', 'porsche').to.be.eql doc
      doc.destroy()
      expect(@alice.get 'garage', 'porsche').to.not.be.eql undefined

  describe '#submitOp', ->
    beforeEach (done) ->
      @doc = @alice.get('songs', 'dedododo')
      @doc.create 'text', '', false, done

    afterEach (done) ->
      @fixtures.reset done


    it 'applies operation locally', (done) ->
      @doc.submitOp ['dedadada'], false, =>
        expect(@doc.snapshot).to.be.eql 'dedadada'
        done()

    it 'applies operation remotely', (done) ->
      @doc.submitOp ['dont think'], false, =>
        doc2 = @bob.get('songs', 'dedododo')
        doc2.fetch (error) ->
          expect(doc2.snapshot).to.be.eql 'dont think'
          done(error)


  describe '#createContext', ->
    describe '#getSnapshot', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'returns the current snapshot after an insert', (done) ->
        ctx = @doc.createContext()
        ctx.insert 5, ' world', (err) =>
          throw err if err
          expect(ctx.getSnapshot()).to.be.eql 'hello world'
          done()

    describe '#getPresence', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello world', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'returns the current presence info', ->
        ctx = @doc.createContext()
        @doc.presence = {hello: 'world'}
        expect(ctx.getPresence()).to.be.eql {hello: 'world'}

    describe '#submitOp', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello world', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'submits the given operation', (done) ->
        ctx = @doc.createContext()
        ctx.submitOp [{d:4}], (err) =>
          throw err if err
          expect(ctx.getSnapshot()).to.be.eql 'o world'
          done()

    describe '#destroy', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello world', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'removes the context', (done) ->
        expect(@doc.editingContexts).to.have.length 0
        ctx = @doc.createContext()
        expect(@doc.editingContexts).to.have.length 1
        ctx.destroy()

        # Hacky way to make sure the whole _otApply was executed
        @doc.on 'after op', =>
          expect(@doc.editingContexts).to.have.length 0
          done()

        # Why the f*** can't the contexts be removed immediately?
        @doc._otApply({op: [{d:5}]}, false)

    describe '#setSelection', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello world', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'sets the docs selection', (done) ->
        ctx = @doc.createContext()
        ctx.onPresence = =>
          expect(@doc.presence).to.have.a.property '_selection', [0,4]
          done()

        ctx.setSelection [0,4]

    describe '#setPresenceProperty', ->
      beforeEach  (done) ->
        @doc = @alice.get 'songs', 'dedododo'
        @doc.create 'text', 'hello world', false, done

      afterEach (done) ->
        @fixtures.reset done

      it 'calls context specific onPresence', (done) ->
        ctx = @doc.createContext()
        ctx.onPresence = (presence) =>
          expect(@doc.presence).to.be.eql presence
          expect(presence).to.have.a.property 'hello', {world: 2}
          done()

        ctx.setPresenceProperty 'hello', {world: 2}

      it 'emits presence event', (done) ->
        ctx = @doc.createContext()
        @doc.on 'presence', (presence) =>
          expect(presence).to.be.eql @doc.presence
          expect(presence).to.be.eql @doc.myPresence
          expect(presence).to.have.a.property 'hello', {world: 2}
          done()

        ctx.setPresenceProperty 'hello', {world: 2}

    describe 'api methods', ->
      beforeEach  ->
        @doc = @alice.get('songs', 'dedododo')

      afterEach (done) ->
        @fixtures.reset done

      it 'attaches all text api methods', ->
        @doc.create 'text', 'hello'
        ctx = @doc.createContext()
        for func in @doc.type.api
          expect(ctx[name]).to.be.a.function
