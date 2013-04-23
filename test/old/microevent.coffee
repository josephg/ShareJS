# Tests for event framework

#testCase = require('nodeunit').testCase

MicroEvent = require '../../src/client/microevent'
makePassPart = require('../helpers').makePassPart

tests =
  'emit an event with no listeners does nothing': (test) ->
    @e.emit 'a'
    @e.emit 'a', 1, 2, 3
    @e.emit 'b', 1, 2, 3
    test.done()
  
  'emitting an event fires the event listener': (test) ->
    @e.on 'foo', -> test.done()
    @e.emit 'foo'
  
  'removing an event listener makes the event listener not fire': (test) ->
    fn = -> throw new Error 'event listener fired'
    @e.on 'foo', fn
    @e.removeListener 'foo', fn
    @e.emit 'foo'
    test.done()

  'event listeners receive arguments passed to emit': (test) ->
    @e.on 'foo', (a, b, c) ->
      test.strictEqual a, 1
      test.strictEqual b, 2
      test.strictEqual c, 3
      test.done()
    @e.emit 'foo', 1, 2, 3
  
  'multiple event listeners are fired': (test) ->
    passPart = makePassPart 2, test.done
    @e.on 'foo', passPart
    @e.on 'foo', passPart
    @e.emit 'foo'

  'removing a missing event listener does nothing': (test) ->
    @e.removeListener 'foo', ->
    @e.emit 'foo' # Does nothing.

    @e.on 'foo', -> test.done()
    @e.removeListener 'foo', ->
    @e.emit 'foo'

  'removing an event listener while handling an event works (after)': (test) ->
    passPart = makePassPart 3, test.done
    fn = -> passPart()
    @e.on 'foo', fn
    @e.on 'foo', =>
      @e.removeListener 'foo', fn
      passPart()
    @e.on 'foo', passPart
    @e.emit 'foo'
  
  'you can remove an event and add it back again and it fires': (test) ->
    fn = -> test.done()
    @e.on 'foo', fn
    @e.removeListener 'foo', fn
    @e.on 'foo', fn
    @e.emit 'foo'
  
  'a listener added to two events, then removed from one, still gets called': (test) ->
    fn = -> test.done()
    @e.on 'foo', fn
    @e.on 'bar', fn
    @e.removeListener 'foo', fn
    @e.emit 'bar'

  'a listener registered with once fires': (test) ->
    @e.once 'foo', (x, y) ->
      test.strictEqual x, 1
      test.strictEqual y, 2
      test.done()
    @e.emit 'foo', 1, 2

  'a listener registered with once only fires once': (test) ->
    calls = 0
    @e.once 'foo', -> calls++
    @e.emit 'foo'
    @e.emit 'foo'

    test.strictEqual calls, 1
    test.done()

  'Listeners are called in the proper context': (test) ->
    passPart = makePassPart 2, test.done
    e = @e
    @e.once 'foo', ->
      test.strictEqual this, e
      passPart()
    @e.on 'foo', ->
      test.strictEqual this, e
      passPart()
    @e.emit 'foo'

  'An event can be emitted before anything is registered': (test) ->
    @e.emit 'blah'
    test.done()

# The tests above are run both with a new MicroEvent and with an object with
# microevent mixed in.

exports.raw = raw =
  setUp: (callback) ->
    @e = new MicroEvent
    callback()

exports.mixinObj = mixinObj =
  setUp: (callback) ->
    @e = {}
    MicroEvent.mixin @e
    callback()

exports.mixinClass = mixinClass =
  setUp: (callback) ->
    class Foo
      bar: ->

    MicroEvent.mixin Foo
    @e = new Foo
    callback()

# Test that the same behaviour holds with nodejs's event emitters.
exports.eventEmitter = eventEmitter =
  setUp: (callback) ->
    @e = new (require 'events').EventEmitter
    callback()

for name, test of tests
  raw[name] = test
  mixinObj[name] = test
  mixinClass[name] = test
  eventEmitter[name] = test
