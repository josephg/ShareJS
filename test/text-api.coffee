# Tests for the text types using the DSL interface
assert = require 'assert'
{randomInt, randomReal, randomWord} = require 'ottypes/randomizer'

types = require 'ottypes'

# Mixin the random op generation functions
require 'ottypes/randomizer'
# & mixin the API methods
require '../src/types'

# Find all the types that claim to implement text.
textTypes = {}
textTypes[type.name] = type for name, type of types when type.api?.provides.text

genTests = (type) -> describe "#{type.name} text api", ->
  beforeEach ->
    # This is a little copy of the context structure created in client/doc.
    # It would probably be better to copy the code, but whatever.
    @ctx =
      _snapshot: type.create()
      getSnapshot: -> @_snapshot
      submitOp: (op, callback) ->
        op = type.normalize op
        @_snapshot = type.apply @_snapshot, op
        callback?()

    @ctx[k] = v for k, v of type.api


  it 'has no length when empty', ->
    assert.strictEqual @ctx.getText(), ''
    assert.strictEqual @ctx.getLength(), 0

  it 'works with simple inserts and removes', ->
    @ctx.insert 0, 'hi'
    assert.strictEqual @ctx.getText(), 'hi'
    assert.strictEqual @ctx.getLength(), 2

    @ctx.insert 2, ' mum'
    assert.strictEqual @ctx.getText(), 'hi mum'
    assert.strictEqual @ctx.getLength(), 6

    @ctx.remove 0, 3
    assert.strictEqual @ctx.getText(), 'mum'
    assert.strictEqual @ctx.getLength(), 3

  it 'gets edited correctly', ->
    content = ''

    for i in [1..1000]
      assert.strictEqual @ctx.getText(), content
      assert.strictEqual @ctx.getLength(), content.length

      if content.length == 0 || randomReal() > 0.5
        # Insert
        pos = randomInt(content.length + 1)
        str = randomWord() + ' '
        @ctx.insert pos, str
        content = content[...pos] + str + content[pos..]
      else
        # Delete
        pos = randomInt content.length
        length = Math.min(randomInt(4), content.length - pos)
        #console.log "pos = #{pos} len = #{length} content = '#{content}'"
        @ctx.remove pos, length
        content = content[...pos] + content[(pos + length)..]
        #console.log "-> content = '#{content}'"

  it 'emits events correctly', ->
    contents = ''

    @ctx.onInsert = (pos, text) ->
      contents = contents[...pos] + text + contents[pos...]
    @ctx.onRemove = (pos, len) ->
      contents = contents[...pos] + contents[(pos + len)...]

    for i in [1..1000]
      [op, newDoc] = type.generateRandomOp @ctx._snapshot

      @ctx.submitOp op
      @ctx._onOp op

      assert.strictEqual @ctx.getText(), contents

genTests(type) for name, type of textTypes

