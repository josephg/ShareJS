assert = require 'assert'

helpers = require '../helpers'

# Testing tool tests
describe 'helpers', ->
  describe '#newDocName()', ->
    it 'creates a new doc name with each invocation', ->
      assert.notStrictEqual helpers.newDocName(), helpers.newDocName()
      assert.strictEqual typeof helpers.newDocName(), 'string'
  
  describe '#makePassPart()', ->
    it '#makePassPart() works', (done) ->
      passPart = helpers.makePassPart 3, done
      passPart()
      passPart()
      passPart()

  describe '#randomInt()', ->
    it 'never returns a value outside its range', ->
      for [1..1000]
        assert 0 <= helpers.randomInt(100) < 100

    it 'always returns an integer', ->
      for [1..1000]
        val = helpers.randomInt(100)
        assert.equal val, Math.floor val



