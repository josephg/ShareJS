shareServer = require '../../lib/server'
assert = require 'assert'
sinon = require 'sinon'

describe 'ShareInstance#process', ->

  backend =
    bulkSubscribe: ->

  beforeEach ->
    @instance = shareServer.createClient(backend: backend)

  it 'runs all middleware', (done)->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance.process 'q', {msg: 'say what'}, ->
      sinon.assert.calledWith middleware1, {action: 'q', msg: 'say what'}
      sinon.assert.calledWith middleware2, {action: 'q', msg: 'say what'}
      done()

  it 'runs middleware in samed order as used', ->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance.process 'q', {}
    sinon.assert.callOrder(middleware1, middleware2)

  it 'returns from stack with early response', ->
    responder = sinon.spy (request, next, respond)->
      respond(null, 'hey')
      next()
    after     = sinon.spy (request, next)-> next()
    @instance.use 'q', responder
    @instance.use 'q', after
    @instance.process 'q', {}
    sinon.assert.called responder
    sinon.assert.notCalled after

  it 'passes response to callback', (done)->
    @instance.use 'q', (request, next, respond)->
      respond('error', 'hey')
      next()
    @instance.process 'q', {}, (error, response)->
      assert.equal response, 'hey'
      assert.equal error, 'error'
      done()

  it 'passes new responder', ->
    responder = sinon.spy (error, res)->
    changeResponder = (request, next)->
      next(responder)
    runner = (request, next, respond)->
      respond('error', 'message')

    @instance.use 'q', changeResponder
    @instance.use 'q', runner

    @instance.process 'q', {}
    sinon.assert.calledWith responder, 'error', 'message'


  it 'changes respond chain', (done)->
    filterMiddleware = (request, next, respond)->
      filter = (error, response)->
        response.filtered = true
        respond(error, response)
      next(filter)

    runner = sinon.spy (request, next, respond)->
      respond(null, {})

    @instance.use 'q', filterMiddleware
    @instance.use 'q', runner

    @instance.process 'q', {}, (error, response)->
      assert.equal response.filtered, true
      done()

  it 'runs all middleware without callback', (done)->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance.process 'q', {msg: 'say what'}
    sinon.assert.calledWith middleware1, {action: 'q', msg: 'say what'}
    sinon.assert.calledWith middleware2, {action: 'q', msg: 'say what'}
    done()

  it 'modifies request', ->
    change = (request, next)->
      change.msg = request.msg
      request.msg = 'gruezi'
      next()
    before = (request, next)->
      before.msg = request.msg
      next()
    after  = (request, next)->
      after.msg = request.msg
      next()

    @instance.use 'q', before
    @instance.use 'q', change
    @instance.use 'q', after

    @instance.process 'q', {msg: 'say what'}
    assert.equal before.msg, 'say what'
    assert.equal change.msg, 'say what'
    assert.equal after.msg,  'gruezi'

  it 'returns error if no middlware responds', (done)->
    @instance.use 'q', (request, next)-> next()
    @instance.process 'q', {}, (error)->
      assert.equal error, 'No middleware responded to your request'
      done()
