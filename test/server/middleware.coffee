shareServer = require '../../lib/server'
assert = require 'assert'
sinon = require 'sinon'

describe 'ShareInstance middleware _trigger', ->

  backend =
    bulkSubscribe: ->

  beforeEach ->
    @instance = shareServer.createClient(backend: backend)

  it 'runs all middleware', (done)->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance._trigger {action: 'q', msg: 'say what'}, ->
      sinon.assert.calledWith middleware1, {action: 'q', msg: 'say what'}
      sinon.assert.calledWith middleware2, {action: 'q', msg: 'say what'}
      done()

  it 'runs middleware in samed order as used', ->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance._trigger {action: 'q', msg: 'say what'}
    sinon.assert.callOrder(middleware1, middleware2)

  it 'without callback runs all middleware', (done)->
    middleware1 = sinon.spy (request, next)-> next()
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance._trigger {action: 'q', msg: 'say what'}
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

    @instance._trigger {action: 'q', msg: 'say what'}
    assert.equal before.msg, 'say what'
    assert.equal change.msg, 'say what'
    assert.equal after.msg,  'gruezi'


  it 'interrupts execution on errors', ->
    middleware1 = sinon.spy (request, next)-> next('error')
    middleware2 = sinon.spy (request, next)-> next()
    @instance.use 'q', middleware1
    @instance.use 'q', middleware2
    @instance._trigger {action: 'q', msg: 'say what'}, (error)->
      assert.equal error, 'error'
      sinon.assert.called middleware1
      sinon.assert.notCalled middleware2
