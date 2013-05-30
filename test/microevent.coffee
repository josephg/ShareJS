# Tests for event framework

assert = require 'assert'

MicroEvent = require '../lib/client/microevent'
makePassPart = require('./helpers').makePassPart

tests = ->
  it 'does nothing when you emit an event with no listeners', ->
    @e.emit 'a'
    @e.emit 'a', 1, 2, 3
    @e.emit 'b', 1, 2, 3
  
  it 'fires the event listener', (done) ->
    @e.on 'foo', -> done()
    @e.emit 'foo'
  
  it 'does not fire a removed event listener', ->
    fn = -> throw new Error 'event listener fired'
    @e.on 'foo', fn
    @e.removeListener 'foo', fn
    @e.emit 'foo'

  it 'passes arguments to event listeners', (done) ->
    @e.on 'foo', (a, b, c) ->
      assert.strictEqual a, 1
      assert.strictEqual b, 2
      assert.strictEqual c, 3
      done()
    @e.emit 'foo', 1, 2, 3
  
  it 'fires multiple event listeners', (done) ->
    passPart = makePassPart 2, done
    @e.on 'foo', passPart
    @e.on 'foo', passPart
    @e.emit 'foo'

  it 'does nothing when you remove a missing event listener', (done) ->
    @e.removeListener 'foo', ->
    @e.emit 'foo' # Does nothing.

    @e.on 'foo', -> done()
    @e.removeListener 'foo', ->
    @e.emit 'foo'

  it 'removes an event listener while handling an event', (done) ->
    passPart = makePassPart 3, done
    fn = -> passPart()
    @e.on 'foo', fn
    @e.on 'foo', =>
      @e.removeListener 'foo', fn
      passPart()
    @e.on 'foo', passPart
    @e.emit 'foo'
  
  it 'will fire an event if you remove it and add it back', (done) ->
    fn = -> done()
    @e.on 'foo', fn
    @e.removeListener 'foo', fn
    @e.on 'foo', fn
    @e.emit 'foo'
  
  it 'fires an event listener that was removed from a different event', (done) ->
    fn = -> done()
    @e.on 'foo', fn
    @e.on 'bar', fn
    @e.removeListener 'foo', fn
    @e.emit 'bar'

  it 'fires a listener registered with once', (done) ->
    @e.once 'foo', (x, y) ->
      assert.strictEqual x, 1
      assert.strictEqual y, 2
      done()
    @e.emit 'foo', 1, 2

  it 'only fires a listener registered with once once', ->
    calls = 0
    @e.once 'foo', -> calls++
    @e.emit 'foo'
    @e.emit 'foo'

    assert.strictEqual calls, 1

  it 'calls listeners in the proper context', (done) ->
    passPart = makePassPart 2, done
    e = @e
    @e.once 'foo', ->
      assert.strictEqual this, e
      passPart()
    @e.on 'foo', ->
      assert.strictEqual this, e
      passPart()
    @e.emit 'foo'

  it 'is ok with emitting before anything is registered', ->
    @e.emit 'blah'

# The tests above are run both with a new MicroEvent and with an object with
# microevent mixed in.

describe 'raw', ->
  beforeEach ->
    @e = new MicroEvent
  tests()

describe 'mixinObj', ->
  beforeEach ->
    @e = {}
    MicroEvent.mixin @e
  tests()

describe 'mixinClass', ->
  beforeEach ->
    class Foo
      bar: ->

    MicroEvent.mixin Foo
    @e = new Foo
  tests()

# Test that the same behaviour holds with nodejs's event emitters.
describe 'eventEmitter', ->
  beforeEach ->
    @e = new (require 'events').EventEmitter

  tests()

