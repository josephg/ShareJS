assert = require("assert")
types = require("ottypes")
require("../lib/types/json-api")
json = types.json0
MicroEvent = require("../lib/client/microevent")

# in the future, it would be less brittle to use the real Doc object instead of this fake one
Doc = (data) ->
  @_snapshot = (if data? then data else json.create())
  @type = json
  @editingContexts = []

  @getSnapshot = ->
    @_snapshot

  @submitOp = (op, context, cb) ->
    @_snapshot = json.apply(@_snapshot, op)
    @emit "op", op
    cb?()

  #createContext is copy-pasted from lib/client/doc
  @createContext = ->
    type = @type
    throw new Error("Missing type")  unless type
    
    doc = this
    context =
      getSnapshot: ->
        doc.getSnapshot()

      submitOp: (op, callback) ->
        doc.submitOp op, context, callback

      destroy: ->
        if @detach
          @detach()
          
          delete @detach
        
        delete @_onOp

        @remove = true

      _doc: this

    if type.api
      for k of type.api
        context[k] = type.api[k]
    else
      context.provides = {}
    @editingContexts.push context
    context

  this

MicroEvent.mixin Doc

apply = (cxt,op) ->
    cxt._beforeOp? op
    cxt.submitOp op
    cxt._onOp op

waitBriefly = (done) ->
  setTimeout ( ->
      assert.ok true
      done()
    ), 10

describe "JSON Client API", ->
  it "sanity check", ->
    doc = new Doc("hi")
    cxt = doc.createContext()
    assert.equal cxt.get(), "hi"
    doc = new Doc(hello: "world")
    cxt = doc.createContext()
    assert.equal cxt.getAt(["hello"]), "world"

  it "getAt", ->
    doc = new Doc(hi: [1, 2, 3])
    cxt = doc.createContext()
    assert.equal cxt.getAt(["hi", 2]), 3

  it "sub-cxt get", ->
    doc = new Doc(hi: [1, 2, 3])
    cxt = doc.createContext()
    hi = cxt.at("hi")
    assert.deepEqual hi.get(), [1, 2, 3]
    assert.equal hi.at(2).get(), 3

  it "object set", ->
    doc = new Doc
    cxt = doc.createContext()
    cxt.at().set hello: "world"
    assert.deepEqual cxt.get(),
      hello: "world"

    cxt.at("hello").set "blah"
    assert.deepEqual cxt.get(),
      hello: "blah"


  it "list set", ->
    doc = new Doc([1, 2, 3])
    cxt = doc.createContext()
    cxt.at(1).set 5
    assert.deepEqual cxt.get(), [1, 5, 3]

  it "remove", ->
    doc = new Doc(hi: [1, 2, 3])
    cxt = doc.createContext()
    hi = cxt.at("hi")
    hi.at(0).remove()
    assert.deepEqual cxt.get(),
      hi: [2, 3]

    hi.remove()
    assert.deepEqual cxt.get(), {}

  it "insert text", ->
    doc = new Doc(text: "Hello there!")
    cxt = doc.createContext()
    cxt.at("text").insert 11, ", ShareJS"
    assert.deepEqual cxt.get(),
      text: "Hello there, ShareJS!"


  it "delete text", ->
    doc = new Doc(text: "Sup, share?")
    cxt = doc.createContext()
    cxt.at("text").del 3, 7
    assert.deepEqual cxt.get(),
      text: "Sup?"


  it "list insert", ->
    doc = new Doc(nums: [1, 2])
    cxt = doc.createContext()
    cxt.at("nums").insert 0, 4
    assert.deepEqual cxt.get(),
      nums: [4, 1, 2]


  it "list push", ->
    doc = new Doc(nums: [1, 2])
    cxt = doc.createContext()
    cxt.at("nums").push 3
    assert.deepEqual cxt.get(),
      nums: [1, 2, 3]


  it "list move", ->
    doc = new Doc(list: [1, 2, 3, 4])
    cxt = doc.createContext()
    list = cxt.at("list")
    list.move 0, 3
    assert.deepEqual cxt.get(),
      list: [2, 3, 4, 1]


  it "number add", ->
    doc = new Doc([1])
    cxt = doc.createContext()
    cxt.at(0).add 4
    assert.deepEqual cxt.get(), [5]

  it "basic listeners", (done) ->
    doc = new Doc(list: [1])
    cxt = doc.createContext()
    cxt.at("list").on "insert", (pos, num) ->
      assert.equal num, 4
      assert.equal pos, 0
      done()

    apply cxt, [
      p: ["list", 0]
      li: 4
    ]

  it "object replace listener", (done) ->
    doc = new Doc(foo: "bar")
    cxt = doc.createContext()
    cxt.at().on "replace", (pos, before, after) ->
      assert.equal before, "bar"
      assert.equal after, "baz"
      assert.equal pos, "foo"
      done()

    apply cxt, [
      p: ["foo"]
      od: "bar"
      oi: "baz"
    ]

  it "list replace listener", (done) ->
    doc = new Doc(["bar"])
    cxt = doc.createContext()
    cxt.at().on "replace", (pos, before, after) ->
      assert.equal before, "bar"
      assert.equal after, "baz"
      assert.equal pos, 0
      done()

    apply cxt, [
      p: [0]
      ld: "bar"
      li: "baz"
    ]

  it "listener moves on li", (done) ->
    doc = new Doc(["bar"])
    cxt = doc.createContext()
    cxt.at(0).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    cxt.at().insert 0, "asdf"

    apply cxt, [
      p: [1, 0]
      si: "foo"
    ]

  it "listener moves on ld", (done) ->
    doc = new Doc(["asdf", "bar"])
    cxt = doc.createContext()
    cxt.at(1).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    cxt.at(0).remove()
    apply cxt, [
      p: [0, 0]
      si: "foo"
    ]

  it "listener moves on array lm", (done) ->
    doc = new Doc(["asdf", "bar"])
    cxt = doc.createContext()
    cxt.at(1).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    cxt.at().move 0, 1
    apply cxt, [
      p: [0, 0]
      si: "foo"
    ]

  it "listener drops on ld", (done) ->
    doc = new Doc([1])
    cxt = doc.createContext()
    cxt.at(0).on "add", (x) ->
      assert.ok false
      done()

    cxt.at(0).set 3
    apply cxt, [
      p: [0]
      na: 1
    ]
    waitBriefly(done)
    

  it "listener drops on od", (done) ->
    doc = new Doc(foo: "bar")
    cxt = doc.createContext()
    cxt.at("foo").on "text-insert", (text, pos) ->
      assert.ok false
      done()

    cxt.at("foo").set "baz"
    apply cxt, [
      p: ["foo", 0]
      si: "asdf"
    ]
    waitBriefly(done)

  it "child op one level", (done) ->
    doc = new Doc(foo: "bar")
    cxt = doc.createContext()
    cxt.at().on "child op", (p, op) ->
      assert.deepEqual p, ["foo", 0]
      assert.equal op.si, "baz"
      done()

    apply cxt, [
      p: ["foo", 0]
      si: "baz"
    ]

  it "child op two levels", (done) ->
    doc = new Doc(foo: ["bar"])
    cxt = doc.createContext()
    cxt.at().on "child op", (p, op) ->
      assert.deepEqual p, ["foo", 0, 3]
      assert.deepEqual op.si, "baz"
      done()

    apply cxt, [
      p: ["foo", 0, 3]
      si: "baz"
    ]

  it "child op path snipping", (done) ->
    doc = new Doc(foo: ["bar"])
    cxt = doc.createContext()
    cxt.at("foo").on "child op", (p, op) ->
      assert.deepEqual p, [0, 3]
      assert.deepEqual op.si, "baz"
      done()

    apply cxt, [
      p: ["foo", 0, 3]
      si: "baz"
    ]

  it "common operation paths intersection", (done) ->
    doc = new Doc(
      name: "name"
      components: []
    )
    cxt = doc.createContext()
    cxt.at("name").on "insert", (p, op) ->

    cxt.at("components").on "child op", (p, op) ->
      done()

    apply cxt, [
      p: ["name", 4]
      si: "X"
    ]

  it "child op not sent when op outside node", (done) ->
    doc = new Doc(foo: ["bar"])
    cxt = doc.createContext()
    cxt.at("foo").on "child op", ->
      assert.ok false
      done()

    cxt.at("baz").set "hi"
    waitBriefly(done)


  it "continues to work after list move operation", (done) ->
    doc = new Doc([
      {top:{foo:'bar'}},
      {bottom:'other'}
    ]);
    cxt = doc.createContext()
    sub = cxt.at [0,'top']

    assert.deepEqual(sub.get(),{foo:'bar'})

    cxt.at().move 0, 1, ->
      assert.deepEqual sub.get(),{foo:'bar'}
      done()




