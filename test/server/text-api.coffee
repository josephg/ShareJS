# Tests for the text types using the DSL interface. This includes the standard
# text type as well as text-tp2 (and any other text types we add). Rich text
# should probably support this API too.
assert = require 'assert'
{randomInt, randomReal, randomWord} = require 'ot-fuzzer'

genTests = (type, genOp) -> describe "text api for '#{type.name}'", ->
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

    @apply = (op) ->
      @ctx._beforeOp? op
      @ctx.submitOp op
      @ctx._onOp op

    @ctx[k] = v for k, v of type.api


  it 'has no length when empty', ->
    assert.strictEqual @ctx.get(), ''
    assert.strictEqual @ctx.getLength(), 0

  it 'works with simple inserts and removes', ->
    @ctx.insert 0, 'hi'
    assert.strictEqual @ctx.get(), 'hi'
    assert.strictEqual @ctx.getLength(), 2

    @ctx.insert 2, ' mum'
    assert.strictEqual @ctx.get(), 'hi mum'
    assert.strictEqual @ctx.getLength(), 6

    @ctx.remove 0, 3
    assert.strictEqual @ctx.get(), 'mum'
    assert.strictEqual @ctx.getLength(), 3

  it 'gets edited correctly', ->
    # This is slow with text-tp2 because the snapshot gets filled with crap and
    # basically cloned with every operation in apply(). It could be fixed at
    # some point by making the document snapshot mutable (and make apply() not
    # clone the snapshot).
    #
    # If you do this, you'll also have to fix text-tp2.api._onOp. It currently
    # relies on being able to iterate through the previous document snapshot to
    # figure out what was inserted & removed.
    content = ''

    for i in [1..1000]
      if content.length == 0 || randomReal() > 0.5
        # Insert
        pos = randomInt(content.length + 1)
        str = randomWord() + ' '
        @ctx.insert pos, str
        content = content[...pos] + str + content[pos..]
      else
        # Delete
        pos = randomInt content.length
        len = Math.min(randomInt(4), content.length - pos)
        @ctx.remove pos, len
        content = content[...pos] + content[(pos + len)..]

      assert.strictEqual @ctx.get(), content
      assert.strictEqual @ctx.getLength(), content.length

  it 'emits events correctly', ->
    contents = ''

    @ctx.onInsert = (pos, text) ->
      contents = contents[...pos] + text + contents[pos...]
    @ctx.onRemove = (pos, len) ->
      contents = contents[...pos] + contents[(pos + len)...]

    for i in [1..1000]
      [op, newDoc] = genOp @ctx._snapshot

      @apply op
      assert.strictEqual @ctx.get(), contents

genTests require('ot-text').type, require('ot-text/test/genOp')
genTests require('ot-text-tp2').type, require('ot-text-tp2/test/genOp')
