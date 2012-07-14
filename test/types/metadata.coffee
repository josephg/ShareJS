# Tests for the document metadata OT code.
#
# This OT code is unlike other OT types.

nativeType = require '../../src/types/metadata'
text = require '../../src/types/text'

clone = (o) -> JSON.parse(JSON.stringify o)

genTests = (type) ->
  'sanity': (test) ->
    test.strictEqual type.name, 'meta'
    test.done()

  'create': (test) ->
    meta = type.create()
    test.strictEqual meta.ctime, meta.mtime
    test.deepEqual meta.sessions, {}
    test.done()

  'create with supplied data': (test) ->
    meta = type.create foo:'bar'
    test.strictEqual meta.foo, 'bar'
    test.done()

  'proper fields cannot be overridden in create': (test) ->
    meta = type.create sessions:null, ctime:null, mtime:null
    test.ok meta.sessions
    test.ok meta.ctime
    test.ok meta.mtime
    test.done()

  'applyOp': (test) ->
    expect = (op, meta, ottype, expected, side = 'left') ->
      opData = {meta:{ts:1000}, op}
      meta = clone meta
      result = type.applyOp meta, ottype, opData, side
      test.deepEqual result, expected
      expected

    meta = type.create()
    meta.ctime = meta.mtime = 1000

    expected = type.create()
    expected.ctime = expected.mtime = 1000

    # Nothing should happen to metadata object with no sessions.
    expect [], meta, text, expected
    expect [p:100, i:'hi'], meta, text, expected

    # If there's a couple sessions with cursors, the cursors should move.
    meta.sessions.a = expected.sessions.a = cursor: 5
    meta.sessions.b = cursor: 105
    expected.sessions.b = cursor: 110

    expect [p:50, i:'abcde'], meta, text, expected
    expect [p:105, i:'abcde'], meta, text, expected, 'right'
    expect [p:105, i:'abcde'], meta, text, meta, 'left'

    test.done()

  'applyOp copies meta op ts into mtime': (test) ->
    meta = type.create()
    meta.ctime = meta.mtime = 1000
    
    out = type.applyOp clone(meta), {}, {meta:ts:2000, op:123}, 'left'
    test.strictEqual out.ctime, 1000
    test.strictEqual out.mtime, 2000
    test.done()

  'applyOp on a type with no transformCursor does nothing': (test) ->
    meta = type.create()
    meta.sessions.a = cursor: 99
    meta.ctime = meta.mtime = 1000
    out = type.applyOp clone(meta), {}, {meta:ts:1000, op:123}, 'left'
    test.deepEqual meta, out
    test.done()

  'applyMop': (test) ->
    original =
      ctime:0
      mtime:0
      sessions:{}

    expect = (mop, meta, expected) ->
      meta = clone meta
      result = type.applyMop meta, mop
      test.deepEqual result, expected
      expected

    meta = original
    meta = expect {id:'abc', as:{x:'y'}}, meta, {ctime:0, mtime:0, sessions:{abc:{x:'y'}}}
    meta = expect {id:'abc', c:100}, meta, {ctime:0, mtime:0, sessions:{abc:{x:'y', cursor:100}}}
    meta = expect {id:'abc', p:'hi', v:5}, meta, {ctime:0, mtime:0, sessions:{abc:{x:'y', cursor:100, hi:5}}}
    meta = expect {id:'abc', p:'hi'}, meta, {ctime:0, mtime:0, sessions:{abc:{x:'y', cursor:100}}}
    meta = expect {id:'abc', rs:true}, meta, {ctime:0, mtime:0, sessions:{}}

    meta = expect {p:'hi', v:5}, meta, {ctime:0, mtime:0, sessions:{}, hi:5}
    meta = expect {p:'hi'}, meta, {ctime:0, mtime:0, sessions:{}}

    meta = expect {n:{sessions:{abc: {x:'y'}},ctime:1,mtime:2}}, meta, {ctime:1, mtime:2, sessions:{abc:{x:'y'}}}

    test.done()

  'transform a cursor metaop 


exports.node = genTests nativeType
