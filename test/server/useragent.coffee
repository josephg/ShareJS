UserAgent = require '../../lib/server/useragent'
sinon = require 'sinon'
{Readable} = require 'stream'
{EventEmitter} = require 'events'
assert = require 'assert'

describe 'UserAgent', ->

  backend = {}

  shareInstance =
    docFilters: []
    opFilters: []
    backend: backend
    _trigger: (request, callback)->
      callback(null, request)

  beforeEach ->
    @userAgent = new UserAgent shareInstance

    shareInstance.docFilters = []
    shareInstance.opFilters  = []


  describe 'fetch', ->
    backend.fetch = (collection, document, callback) ->
      callback null, {v:10, color: 'yellow'}

    it 'calls fetch on backend', (done) ->
      sinon.spy backend, 'fetch'
      @userAgent.fetch 'flowers', 'lily', ->
        sinon.assert.calledWith backend.fetch, 'flowers', 'lily'
        done()

    it 'returns backend result', (done)->
      @userAgent.fetch 'flowers', 'lily', (error, document)->
        assert.deepEqual document, {v: 10, color: 'yellow'}
        done()

    describe 'with doc filters', ->

      it 'calls filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.docFilters.push filter
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          sinon.assert.calledWith filter, 'flowers', 'lily', {color: 'yellow', v: 10}
          done()

      it 'manipulates document', (done)->
        shareInstance.docFilters.push (collection, docName, data, next)->
          data.color = 'red'
          next()
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal document.color, 'red'
          done()

      it 'passes exceptions as error', (done)->
        shareInstance.docFilters.push -> throw Error 'oops'
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal error, 'oops'
          done()

      it 'passes errors', (done)->
        shareInstance.docFilters.push (args..., next)-> next('oops')
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal error, 'oops'
          done()


  describe '#subscribe', ->

    operationStream = new Readable objectMode: yes
    operationStream._read = ->
    beforeEach -> operationStream.unpipe()

    backend.subscribe = (args..., callback)->
      callback(null, operationStream)

    it 'calls fetch on backend', (done)->
      sinon.spy backend, 'subscribe'
      @userAgent.subscribe 'flowers', 'lily', 10, ->
        sinon.assert.calledWith backend.subscribe, 'flowers', 'lily', 10
        done()

    it 'can read operationStream', (done)->
      @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream)->
        subscriptionStream.on 'readable', (data)->
          assert.equal subscriptionStream.read(), 'first operation'
          done()
        operationStream.push 'first operation'


    describe 'with op filters', ->

      it 'calls the filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.opFilters.push filter
        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream)=>
          subscriptionStream.on 'readable', (data)=>
            sinon.assert.calledWith filter, 'flowers', 'lily', 'an op'
            done()
          operationStream.push 'an op'

      it 'passes exceptions as errors to operationStream', (done)->
        shareInstance.opFilters.push -> throw Error 'oops'

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream)->
          subscriptionStream.on 'readable', (data)->
            assert.deepEqual subscriptionStream.read(), {error: 'oops'}
            done()
          operationStream.push {op: 'first operation'}

      it 'passes errors to operationStream', (done)->
        shareInstance.opFilters.push (args..., next)-> next('oops')

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream)->
          subscriptionStream.on 'readable', (data)->
            assert.deepEqual subscriptionStream.read(), {error: 'oops'}
            done()
          operationStream.push {op: 'first operation'}

      it 'manipulates operation', (done)->
        shareInstance.opFilters.push (collection, docName, operation, next)->
          operation.op = 'gotcha!'
          next()

        @userAgent.subscribe 'flowers', 'lily', 10, (error, subscriptionStream)->
          subscriptionStream.on 'readable', (data)->
            assert.deepEqual subscriptionStream.read(), {op: 'gotcha!'}
            done()
          operationStream.push {op: 'first operation'}


  describe '#submit', ->

    backend.submit = (collection, document, opData, options, callback)->
      callback(null, 41, ['operation'], 'a document')

    it 'calls submit on backend', (done)->
      sinon.spy backend, 'submit'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, ->
        sinon.assert.calledWith backend.submit, 'flowers', 'lily', 'pluck'
        done()

    it 'returns version and operations', (done)->
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, (error, version, operations)->
        assert.equal version, 41
        assert.deepEqual operations, ['operation']
        done()

    it 'triggers after submit', (done)->
      sinon.spy @userAgent, 'trigger'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, =>
        sinon.assert.calledWith @userAgent.trigger, 'after submit', 'flowers', 'lily'
        done()


  describe '#queryFetch', ->

    backend.queryFetch = (collection, query, options, callback)->
      callback null, [
        {docName: 'rose', color: 'white'},
        {docName: 'lily', color: 'yellow'}]
      , 'all'

    it 'calls queryFetch on backend', (done)->
      sinon.spy backend, 'queryFetch'
      @userAgent.queryFetch 'flowers', {smell: 'nice'}, {all: yes}, ->
        sinon.assert.calledWith backend.queryFetch, 'flowers', {smell: 'nice'}, {all: yes}
        done()

    it 'returns documents and extra', (done)->
      @userAgent.queryFetch 'flowers', {smell: 'nice'}, {all: yes}, (error, results, extra)->
        assert.equal extra, 'all'
        assert.deepEqual results[0], {docName: 'rose', color: 'white'}
        assert.deepEqual results[1], {docName: 'lily', color: 'yellow'}
        done()

    it 'filters documents', (done)->
      shareInstance.docFilters.push (collection, docName, data, next)->
        if docName == 'rose'
          data.color = 'red'
        next()
      @userAgent.queryFetch 'flowers', {}, {}, (error, results)->
        assert.equal results[0].color, 'red'
        done()


  describe '#query', ->

    beforeEach ->
      @queryEmitter = new EventEmitter
      @queryEmitter.data = [{docName: 'lily', color: 'yellow'}]

      backend.query = (collection, query, options, next)=>
        next(null, @queryEmitter)

    it 'calls query on backend', (done)->
      sinon.spy backend, 'query'
      @userAgent.query 'flowers', {smell: 'nice'}, {all: yes}, ->
        sinon.assert.calledWith backend.query, 'flowers', {smell: 'nice'}, {all: yes}
        done()

    it 'attaches results to emitter', (done)->
      @userAgent.query 'flowers', {}, {}, (error, emitter)=>
        assert.deepEqual emitter.data[0], {docName: 'lily', color: 'yellow'}
        done()

    it 'fires emit', (done)->
      @userAgent.query 'flowers', {}, {}, (error, emitter)=>
        emitter.on 'diff', (diffs)->
          assert.equal diffs, 'This changed'
          done()
        @queryEmitter.emit('diff', 'This changed')

    it.skip 'filters records inserted into query results', (done)->
      shareInstance.docFilters.push (collection, docName, data, next)->
        if docName == 'rose'
          data.color = 'red'
        next()
      @userAgent.query 'flowers', {}, {}, (error, emitter)=>
        emitter.on 'diff', (diff)->
          assert.equal diff[0].values[0].color, 'red'
          done()
        @queryEmitter.emit('diff', [{
          type: 'insert',
          values: [{docName: 'rose', color: 'white'}]
        }])


  describe '#trigger with middleware', ->

    beforeEach ->
      backend.bulkSubscribe = true
      @instance = require('../../lib/server').createClient(backend: backend)
      @userAgent.instance = @instance

    it 'runs middleware', (done)->
      @instance.use 'smell', (request, next)->
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', {}

    it 'runs default middleware', (done)->
      @instance.use (request, next)->
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', {}

    it 'runs middleware with request', (done)->
      @instance.use 'smell', (request, next)->
        assert.equal request.action, 'smell'
        assert.equal request.collection, 'flowers'
        assert.equal request.docName, 'lily'
        assert.equal request.deep, true
        assert.deepEqual request.backend, backend
        done()
      @userAgent.trigger 'smell', 'flowers', 'lily', deep: true

    it 'passes modified request to callback', (done)->
      @instance.use 'smell', (request, next)->
        request.eyesClosed = true
        next()
      @userAgent.trigger 'smell', 'flowers', 'lily', (error, request)->
        assert.ok request.eyesClosed
        done()

    it 'passes errors to callback', (done)->
      @instance.use 'smell', (request, next)->
        next('Argh!')
      @userAgent.trigger 'smell', 'flowers', 'lily', (error, request)->
        assert.equal error, 'Argh!'
        done()
