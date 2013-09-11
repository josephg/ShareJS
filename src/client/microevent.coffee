# This is a simple port of microevent.js to Coffeescript. I've changed the
# function names to be consistent with node.js EventEmitter.
#
# microevent.js is copyright Jerome Etienne, and licensed under the MIT license:
# https://github.com/jeromeetienne/microevent.js

nextTick = if WEB? then (fn) -> setTimeout fn, 0 else process['nextTick']

class MicroEvent
  on: (event, f) ->
    @_events ||= {}
    @_events[event] ||= []
    @_events[event].push(f)
    this

  removeListener: (event, fct) ->
    @_events ||= {}
    listeners = (@_events[event] ||= [])
    
    # Sadly, there's no IE8- support for indexOf.
    i = 0
    while i < listeners.length
      listeners[i] = undefined if listeners[i] == fct
      i++

    nextTick => @_events[event] = (x for x in @_events[event] when x)

    this

  emit: (event, args...) ->
    return this unless @_events?[event]
    fn.apply this, args for fn in @_events[event] when fn
    this

  once: (event, f) ->
    @on event, listener = (args...) =>
      @removeListener event, listener
      f.apply this, args

# mixin will delegate all MicroEvent.js function in the destination object
MicroEvent.mixin = (obj) ->
  proto = obj:: || obj

  proto.on = MicroEvent::on
  proto.removeListener = MicroEvent::removeListener
  proto.emit = MicroEvent::emit
  proto.once = MicroEvent::once
  obj

module.exports = MicroEvent unless WEB?

