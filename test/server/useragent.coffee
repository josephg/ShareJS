UserAgent = require '../../lib/server/useragent'
{Readable} = require 'stream'
{EventEmitter} = require 'events'
sinon = require 'sinon'
assert = require 'assert'

describe 'UserAgent', ->

  backend =
    bulkSubscribe: ->

  shareInstance = null

  before ->
    shareInstance = require('../lib/server').createClient(backend: backend)
    shareInstance.useDocFilterMiddleware()
    shareInstance.useOpFilterMiddleware()

  beforeEach ->
    @userAgent = new UserAgent shareInstance

    shareInstance.docFilters = []
    shareInstance.opFilters  = []


  describe '#fetch', ->

    before ->
      backend.fetch = (collection, document, callback)->
        callback(null, color: 'yellow')

    it 'calls fetch on backend', (done)->
      sinon.spy backend, 'fetch'
      @userAgent.fetch 'flowers', 'lily', ->
        sinon.assert.calledWith backend.fetch, 'flowers', 'lily'
        backend.fetch.reset()
        done()

    it 'returns backend result', (done)->
      @userAgent.fetch 'flowers', 'lily', (error, document)->
        assert.deepEqual document, color: 'yellow'
        done()

    describe 'with doc filters', ->

      it 'calls filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.docFilter filter
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          sinon.assert.calledWith filter, 'flowers', 'lily', color: 'yellow'
          done()

      it 'manipulates document', (done)->
        shareInstance.docFilter (collection, docName, data, next)->
          data.color = 'red'
          next()
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal document.color, 'red'
          done()

      it 'passes errors', (done)->
        shareInstance.docFilter (args..., next)-> next('oops')
        @userAgent.fetch 'flowers', 'lily', (error, document)=>
          assert.equal error, 'oops'
          done()

  describe '#bulkFetch', ->

    bulkRequest = flowers: ['edelweiss', 'tulip']

    before ->
      backend.bulkFetch = (request, callback)->
        callback null,
          flowers:
            edelweiss: { color: 'white' }
            tulip:     { color: 'eggshell' }
          cars:
            porsche:   { color: 'red' }
      shareInstance.useBackendEndpoints()

    it 'calls bulk fetch on backend', (done)->
      sinon.spy backend, 'bulkFetch'
      @userAgent.bulkFetch bulkRequest, ->
        sinon.assert.calledWith backend.bulkFetch, bulkRequest
        backend.bulkFetch.reset()
        done()

    it 'returns backend result', (done)->
      @userAgent.bulkFetch bulkRequest, (error, documents)->
        assert.deepEqual documents.flowers.edelweiss, color: 'white'
        assert.deepEqual documents.flowers.tulip, color: 'eggshell'
        assert.deepEqual documents.cars.porsche, color: 'red'
        done()

    describe 'with doc filters', ->

      it 'calls filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.docFilter filter
        @userAgent.bulkFetch bulkRequest, (error, documents)=>
          sinon.assert.calledWith filter,
            'flowers', 'edelweiss', color: 'white'
          sinon.assert.calledWith filter,
            'flowers', 'tulip', color: 'eggshell'
          done()

      it 'manipulates document', (done)->
        shareInstance.docFilter (collection, docName, data, next)->
          if collection == 'cars'
            data.color = 'british racing green'
          else
            data.color = 'blue'
          next()
        @userAgent.bulkFetch bulkRequest, (error, documents)=>
          assert.equal documents.flowers.edelweiss.color, 'blue'
          assert.equal documents.flowers.tulip.color, 'blue'
          assert.equal documents.cars.porsche.color, 'british racing green'
          done()

      it 'passes errors', (done)->
        shareInstance.docFilter (args..., next)-> next('oops')
        @userAgent.bulkFetch bulkRequest, (error)=>
          assert.equal error, 'oops'
          done()

    xdescribe 'emulation without backend support', ->

      it 'calls backend fetch'

      it 'builds result map'


  describe '#getOps', ->

    before ->
      backend.getOps = (args..., callback)->
        callback(null, [{bloom: yes}])

    it 'calls getOps on backend', (done)->
      sinon.spy backend, 'getOps'
      @userAgent.getOps 'flowers', 'lily', 10, 12, ->
        sinon.assert.calledWith backend.getOps, 'flowers', 'lily', 10, 12
        backend.getOps.reset()
        done()

    it 'returns backend result', (done)->
      @userAgent.getOps 'flowers', 'lily', 1, 3, (error, operations)->
        assert.deepEqual operations[0], bloom: yes
        done()


    describe 'with op filters', ->

      it 'calls the filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.filterOps filter
        @userAgent.getOps 'flowers', 'lily', 0, 1, ->
          sinon.assert.calledWith filter, 'flowers', 'lily', {bloom: yes}
          done()

      it 'manipulates operation', (done)->
        shareInstance.filterOps (collection, docName, operation, next)->
          operation.op = 'gotcha!'
          next()

        @userAgent.getOps 'flowers', 'lily', 1,2, (error, operations)->
          assert.deepEqual operations[0], {op: 'gotcha!', bloom: yes}
          done()


  describe '#subscribe', ->

    operationStream = new Readable objectMode: yes
    operationStream._read = ->
    beforeEach -> operationStream.unpipe()

    before ->
      backend.subscribe = (args..., callback)->
        callback(null, operationStream)

    it 'calls subscribe on backend', (done)->
      sinon.spy backend, 'subscribe'
      @userAgent.subscribe 'flowers', 'lily', 10, ->
        sinon.assert.calledWith backend.subscribe, 'flowers', 'lily', 10
        backend.subscribe.reset()
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


  describe '#bulkSubscribe', ->

    operationStream = new Readable objectMode: yes
    operationStream._read = ->
    beforeEach -> operationStream.unpipe()

    bulkRequest =
      flowers:
        lily: 3
        tulip: null
      cars:
        porsche: 2

    before ->
      backend.bulkSubscribe = (args..., callback)->
        callback null,
          flowers:
            lily: operationStream
            tulip: operationStream
          cars:
            porsche: operationStream
      shareInstance.useBackendEndpoints()

    it 'calls subscribe on backend', (done)->
      sinon.spy backend, 'bulkSubscribe'
      @userAgent.bulkSubscribe bulkRequest, ->
        sinon.assert.calledWith backend.bulkSubscribe, bulkRequest
        backend.bulkSubscribe.reset()
        done()

    it 'can read operationStream', (done)->
      @userAgent.bulkSubscribe bulkRequest, (error, streams)->
        stream = streams.flowers.lily
        stream.on 'readable', (data)->
          assert.equal stream.read(), 'first operation'
          done()
        operationStream.push 'first operation'


    describe 'with op filters', ->

      it 'calls the filter', (done)->
        filter = sinon.spy (args..., next)-> next()
        shareInstance.opFilters.push filter
        @userAgent.bulkSubscribe bulkRequest, (error, streams)->
          stream = streams.flowers.lily
          stream.on 'readable', (data)=>
            sinon.assert.calledWith filter, 'flowers', 'lily', 'an op'
            done()
          operationStream.push 'an op'

      it 'manipulates operation', (done)->
        shareInstance.opFilters.push (collection, docName, operation, next)->
          operation.op = 'gotcha!'
          next()

        @userAgent.bulkSubscribe bulkRequest, (error, streams)->
          stream = streams.flowers.lily
          stream.on 'readable', (data)->
            assert.deepEqual stream.read(), {op: 'gotcha!'}
            done()
          operationStream.push {op: 'first operation'}


  describe '#fetchAndSubscribe', ->

    operationStream = new Readable objectMode: yes
    operationStream._read = ->
    beforeEach -> operationStream.unpipe()

    before ->
      backend.fetch = (collection, document, callback)->
        callback(null, color: 'yellow')

      backend.subscribe = (args..., callback)->
        callback(null, operationStream)

    it 'calls fetchAndSubscribe on backend', (done)->
      sinon.spy backend, 'fetch'
      @userAgent.fetchAndSubscribe 'flowers', 'lily', ->
        sinon.assert.calledWith backend.fetch, 'flowers', 'lily'
        backend.fetch.reset()
        done()

    it 'returns document data', (done)->
      @userAgent.fetchAndSubscribe 'flowers', 'lily', (error, document)->
        assert.deepEqual document, color: 'yellow'
        done()

    it 'can read operationStream', (done)->
      @userAgent.fetchAndSubscribe 'flowers', 'lily', (error, document, subscriptionStream)->
        subscriptionStream.on 'readable', (data)->
          assert.equal subscriptionStream.read(), 'first operation'
          done()
        operationStream.push 'first operation'

  describe '#submit', ->

    before ->
      backend.submit = (collection, document, opData, options, callback)->
        callback(null, 41, ['operation'], 'a document')

    it 'calls submit on backend', (done)->
      sinon.spy backend, 'submit'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, ->
        sinon.assert.calledWith backend.submit, 'flowers', 'lily', 'pluck'
        backend.submit.reset()
        done()

    it 'returns version and operations', (done)->
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, (error, version, operations)->
        assert.equal version, 41
        assert.deepEqual operations, ['operation']
        done()

    it 'triggers after submit', (done)->
      sinon.spy @userAgent, 'trigger'
      @userAgent.submit 'flowers', 'lily', 'pluck', {}, =>
        sinon.assert.calledWith @userAgent.trigger, 'after submit'
        done()


  describe '#queryFetch', ->

    before ->
      backend.queryFetch = (collection, query, options, callback)->
        callback null, [
          {docName: 'rose', color: 'white'},
          {docName: 'lily', color: 'yellow'}]
        , 'all'

    it 'calls queryFetch on backend', (done)->
      sinon.spy backend, 'queryFetch'
      @userAgent.queryFetch 'flowers', {smell: 'nice'}, {all: yes}, ->
        sinon.assert.calledWith backend.queryFetch, 'flowers', {smell: 'nice'}, {all: yes}
        backend.queryFetch.reset()
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
        backend.query.reset()
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

    it 'filters records inserted into query results', (done)->
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
