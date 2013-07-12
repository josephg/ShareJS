assert = require("assert")
types = require("ottypes")
json_api = require("../lib/types/json-api")
json = types.json0
MicroEvent = require("../lib/client/microevent")

Doc = (data) ->
  @_snapshot = (if data? then data else json.create())
  @type = json
  @getSnapshot = ->
    @_snapshot

  @submitOp = (op, cb) ->
    @_snapshot = json.apply(@_snapshot, op)
    @emit "change", op
    cb?()


  for k of json_api
    this[k] = json_api[k]

  this

MicroEvent.mixin Doc

apply = (doc,op) ->
    doc._beforeOp? op
    doc.submitOp op
    doc._onOp op

waitBriefly = (done) ->
  setTimeout ( ->
      assert.ok true
      done()
    ), 10

describe "JSON Client API", ->
  it "sanity check", ->
    doc = undefined
    doc = new Doc("hi")
    assert.equal doc.get(), "hi"
    doc = new Doc(hello: "world")
    assert.equal doc.getAt(["hello"]), "world"

  it "getAt", ->
    doc = undefined
    doc = new Doc(hi: [1, 2, 3])
    assert.equal doc.getAt(["hi", 2]), 3

  it "sub-doc get", ->
    doc = undefined
    hi = undefined
    doc = new Doc(hi: [1, 2, 3])
    hi = doc.at("hi")
    assert.deepEqual hi.get(), [1, 2, 3]
    assert.equal hi.at(2).get(), 3

  it "object set", ->
    doc = undefined
    doc = new Doc
    doc.at().set hello: "world"
    assert.deepEqual doc.get(),
      hello: "world"

    doc.at("hello").set "blah"
    assert.deepEqual doc.get(),
      hello: "blah"


  it "list set", ->
    doc = undefined
    doc = new Doc([1, 2, 3])
    doc.at(1).set 5
    assert.deepEqual doc.get(), [1, 5, 3]

  it "remove", ->
    doc = undefined
    hi = undefined
    doc = new Doc(hi: [1, 2, 3])
    hi = doc.at("hi")
    hi.at(0).remove()
    assert.deepEqual doc.get(),
      hi: [2, 3]

    hi.remove()
    assert.deepEqual doc.get(), {}

  it "insert text", ->
    doc = undefined
    doc = new Doc(text: "Hello there!")
    doc.at("text").insert 11, ", ShareJS"
    assert.deepEqual doc.get(),
      text: "Hello there, ShareJS!"


  it "delete text", ->
    doc = undefined
    doc = new Doc(text: "Sup, share?")
    doc.at("text").del 3, 7
    assert.deepEqual doc.get(),
      text: "Sup?"


  it "list insert", ->
    doc = undefined
    doc = new Doc(nums: [1, 2])
    doc.at("nums").insert 0, 4
    assert.deepEqual doc.get(),
      nums: [4, 1, 2]


  it "list push", ->
    doc = undefined
    doc = new Doc(nums: [1, 2])
    doc.at("nums").push 3
    assert.deepEqual doc.get(),
      nums: [1, 2, 3]


  it "list move", ->
    doc = undefined
    list = undefined
    doc = new Doc(list: [1, 2, 3, 4])
    list = doc.at("list")
    list.move 0, 3
    assert.deepEqual doc.get(),
      list: [2, 3, 4, 1]


  it "number add", ->
    doc = undefined
    doc = new Doc([1])
    doc.at(0).add 4
    assert.deepEqual doc.get(), [5]

  it "basic listeners", (done) ->
    doc = undefined
    doc = new Doc(list: [1])
    doc.at("list").on "insert", (pos, num) ->
      assert.equal num, 4
      assert.equal pos, 0
      done()

    apply doc, [
      p: ["list", 0]
      li: 4
    ]

  it "object replace listener", (done) ->
    doc = undefined
    doc = new Doc(foo: "bar")
    doc.at().on "replace", (pos, before, after) ->
      assert.equal before, "bar"
      assert.equal after, "baz"
      assert.equal pos, "foo"
      done()

    apply doc, [
      p: ["foo"]
      od: "bar"
      oi: "baz"
    ]

  it "list replace listener", (done) ->
    doc = undefined
    doc = new Doc(["bar"])
    doc.at().on "replace", (pos, before, after) ->
      assert.equal before, "bar"
      assert.equal after, "baz"
      assert.equal pos, 0
      done()

    apply doc, [
      p: [0]
      ld: "bar"
      li: "baz"
    ]

  it "listener moves on li", (done) ->
    doc = undefined
    doc = new Doc(["bar"])
    doc.at(0).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    doc.at().insert 0, "asdf"

    apply doc, [
      p: [1, 0]
      si: "foo"
    ]

  it "listener moves on ld", (done) ->
    doc = undefined
    doc = new Doc(["asdf", "bar"])
    doc.at(1).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    doc.at(0).remove()
    apply doc, [
      p: [0, 0]
      si: "foo"
    ]

  it "listener moves on lm", (done) ->
    doc = undefined
    doc = new Doc(["asdf", "bar"])
    doc.at(1).on "insert", (i, s) ->
      assert.equal s, "foo"
      assert.equal i, 0
      done()

    doc.at().move 0, 1
    apply doc, [
      p: [0, 0]
      si: "foo"
    ]

  it "listener drops on ld", (done) ->
    doc = undefined
    doc = new Doc([1])
    doc.at(0).on "add", (x) ->
      assert.ok false
      done()

    doc.at(0).set 3
    apply doc, [
      p: [0]
      na: 1
    ]
    waitBriefly(done)
    

  it "listener drops on od", (done) ->
    doc = undefined
    doc = new Doc(foo: "bar")
    doc.at("foo").on "text-insert", (text, pos) ->
      assert.ok false
      done()

    doc.at("foo").set "baz"
    apply doc, [
      p: ["foo", 0]
      si: "asdf"
    ]
    waitBriefly(done)

  it "child op one level", (done) ->
    doc = undefined
    doc = new Doc(foo: "bar")
    doc.at().on "child op", (p, op) ->
      assert.deepEqual p, ["foo", 0]
      assert.equal op.si, "baz"
      done()

    apply doc, [
      p: ["foo", 0]
      si: "baz"
    ]

  it "child op two levels", (done) ->
    doc = undefined
    doc = new Doc(foo: ["bar"])
    doc.at().on "child op", (p, op) ->
      assert.deepEqual p, ["foo", 0, 3]
      assert.deepEqual op.si, "baz"
      done()

    apply doc, [
      p: ["foo", 0, 3]
      si: "baz"
    ]

  it "child op path snipping", (done) ->
    doc = undefined
    doc = new Doc(foo: ["bar"])
    doc.at("foo").on "child op", (p, op) ->
      assert.deepEqual p, [0, 3]
      assert.deepEqual op.si, "baz"
      done()

    apply doc, [
      p: ["foo", 0, 3]
      si: "baz"
    ]

  it "common operation paths intersection", (done) ->
    doc = undefined
    doc = new Doc(
      name: "name"
      components: []
    )
    doc.at("name").on "insert", (p, op) ->

    doc.at("components").on "child op", (p, op) ->
      done()

    apply doc, [
      p: ["name", 4]
      si: "X"
    ]

  it "child op not sent when op outside node", (done) ->
    doc = undefined
    doc = new Doc(foo: ["bar"])
    doc.at("foo").on "child op", ->
      assert.ok false
      done()

    doc.at("baz").set "hi"
    waitBriefly(done)

