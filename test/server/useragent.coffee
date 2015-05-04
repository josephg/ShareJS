sinon = require 'sinon'
assert = require 'assert'

UserAgent = require '../../lib/server/useragent'
{Readable} = require 'stream'
{EventEmitter} = require 'events'
server = require '../../lib/server'

describe 'UserAgent', ->

  backend = {}

  shareInstance =
    docFilters: []
    opFilters: []
    backend: backend
    _trigger: (request, callback) ->
      callback(null, request)

  beforeEach ->
    @userAgent = new UserAgent shareInstance

    shareInstance.docFilters = []
    shareInstance.opFilters  = []


  describe 'fetch', ->
    backend.fetch = sinon.stub().yields null, {v:10, color: 'yellow'}

    it 'calls fetch on backend', (done) ->
      @userAgent.fetch 'flowers', 'lily', ->
        sinon.assert.calledWith backend.fetch, 'flowers', 'lily'
        done()

    it 'returns backend result', (done)->
      @userAgent.fetch 'flowers', 'lily', (error, document)->
        assert.deepEqual document, {v: 10, color: 'yellow'}
        done()

    describe 'with doc filters', ->

      it 'calls filter', (done) ->
        filter = sinon.spy (args..., next) -> next()
        shareInstance.docFilters.push filter
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          sinon.assert.calledWith filter, 'flowers', 'lily', {color: 'yellow', v: 10}
          done()

      it 'manipulates document', (done) ->
        shareInstance.docFilters.push (collection, docName, data, next) ->
          data.color = 'red'
          next()
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal document.color, 'red'
          done()

      it.skip 'passes exceptions as error', (done)->
        shareInstance.docFilters.push -> throw Error 'oops'
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal error, 'oops'
          done()

      it 'passes errors', (done) ->
        shareInstance.docFilters.push (args..., next) -> next('oops')
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal error, 'oops'
          done()


  describe '#subscribe', ->

    beforeEach ->
      @opStream = new Readable objectMode: yes
      @opStream._read = ->
      @opStream.unpipe()
      backend.subscribe = sinon.stub().yields null, @opStream

    afterEach ->
      backend.subscribe = null

    it 'calls subscribe on the backend', (done) ->
      @userAgent.subscribe 'flowers', 'lily', 10, ->
        sinon.assert.calledWith backend.subscribe, 'flowers', 'lily', 10
        done()

    it 'can read operationStream', (done) ->
      @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream) =>
        subscriptionStream.on 'readable', (data) ->
          assert.equal subscriptionStream.read(), 'first operation'
          done()
        @opStream.push 'first operation'

    describe 'with op filters', ->

      it 'calls the filter', (done) ->
        filter = sinon.stub().yields()
        shareInstance.opFilters.push filter
        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream) =>
          subscriptionStream.on 'readable', (data) ->
            sinon.assert.calledWith filter, 'flowers', 'lily', 'an op'
            done()
          @opStream.push 'an op'

      it.skip 'passes exceptions as errors to operationStream', (done)->
        shareInstance.opFilters.push -> throw Error 'oops'

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream) =>
          subscriptionStream.on 'readable', (data) ->
            assert.deepEqual subscriptionStream.read(), {error: 'oops'}
            done()
          @opStream.push {op: 'first operation'}

      it 'passes errors to operationStream', (done) ->
        shareInstance.opFilters.push sinon.stub().yields 'oops'

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream) =>
          subscriptionStream.on 'readable', (data) ->
            assert.deepEqual subscriptionStream.read(), {error: 'oops'}
            done()
          @opStream.push {op: 'first operation'}

      it 'manipulates operation', (done) ->
        shareInstance.opFilters.push (collection, docName, operation, next) ->
          operation.op = 'gotcha!'
          next()

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream) =>
          subscriptionStream.on 'readable', (data) ->
            assert.deepEqual subscriptionStream.read(), {op: 'gotcha!'}
            done()
          @opStream.push {op: 'first operation'}


  describe '#submit', ->

    backend.submit = (collection, document, opData, options, callback) ->
      callback(null, 41, ['operation'], 'a document')

    it 'calls submit on backend', (done) ->
      sinon.spy backend, 'submit'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, ->
        sinon.assert.calledWith backend.submit, 'flowers', 'lily', 'pluck'
        done()

    it 'returns version and operations', (done) ->
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, (error, version, operations) ->
        assert.equal version, 41
        assert.deepEqual operations, ['operation']
        done()

    it 'triggers after submit', (done) ->
      sinon.spy @userAgent, 'trigger'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, =>
        sinon.assert.calledWith @userAgent.trigger, 'after submit', 'flowers', 'lily'
        done()


  describe '#queryFetch', ->
    beforeEach ->
      backend.queryFetch = sinon.stub().yields null, [
        {docName: 'rose', color: 'white'},
        {docName: 'lily', color: 'yellow'}]
      , 'all'

    afterEach ->
      backend.queryFetch = null

    it 'calls queryFetch on backend', (done) ->
      @userAgent.queryFetch 'flowers', {smell: 'nice'}, {all: yes}, ->
        sinon.assert.calledWith backend.queryFetch, 'flowers', {smell: 'nice'}, {all: yes}
        done()

    it 'returns documents and extra', (done) ->
      @userAgent.queryFetch 'flowers', {smell: 'nice'}, {all: yes}, (error, results, extra) ->
        assert.equal extra, 'all'
        assert.deepEqual results[0], {docName: 'rose', color: 'white'}
        assert.deepEqual results[1], {docName: 'lily', color: 'yellow'}
        done()

    it 'filters documents', (done) ->
      shareInstance.docFilters.push (collection, docName, data, next) ->
        if docName == 'rose'
          data.color = 'red'
        next()
      @userAgent.queryFetch 'flowers', {}, {}, (error, results) ->
        assert.equal results[0].color, 'red'
        done()


  describe '#query', ->

    beforeEach ->
      @queryEmitter = {}
      results = [{docName: 'lily', color: 'yellow'}]
      backend.query = sinon.stub().yields null, @queryEmitter, results

    afterEach ->
      backend.query = null

    it 'calls query on backend', (done) ->
      @userAgent.query 'flowers', {smell: 'nice'}, {all: yes}, =>
        sinon.assert.calledWith backend.query, 'flowers', {smell: 'nice'}, {all: yes}
        done()

    it 'returns results', (done) ->
      @userAgent.query 'flowers', {}, {}, (error, emitter, results) =>
        assert.deepEqual results, [{docName: 'lily', color: 'yellow'}]
        done()

    it 'filters records inserted into query results'


  describe '#trigger with middleware', ->

    beforeEach ->
      backend.bulkSubscribe = true
      @instance = server.createClient backend: backend
      @userAgent.instance = @instance

    it 'runs middleware', (done) ->
      @instance.use 'smell', (request, next) ->
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', {}

    it 'runs default middleware', (done) ->
      @instance.use (request, next) ->
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', {}

    it 'runs middleware with request', (done) ->
      @instance.use 'smell', (request, next) ->
        assert.equal request.action, 'smell'
        assert.equal request.collection, 'flowers'
        assert.equal request.docName, 'lily'
        assert.equal request.deep, true
        assert.deepEqual request.backend, backend
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', deep: true

    it 'passes modified request to callback', (done) ->
      @instance.use 'smell', (request, next) ->
        request.eyesClosed = true
        next()
      @userAgent.trigger 'smell', 'flowers', 'lily', (error, request) ->
        assert.ok request.eyesClosed
        done()

    it 'passes errors to callback', (done) ->
      @instance.use 'smell', (request, next) ->
        next('Argh!')
      @userAgent.trigger 'smell', 'flowers', 'lily', (error, request) ->
        assert.equal error, 'Argh!'
        done()
