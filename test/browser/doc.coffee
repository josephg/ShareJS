assert = require 'assert'
ottypes = require 'ottypes'

describe 'Doc', ->

  {Connection} = require('share')
  {BCSocket} = require('bcsocket')

  fixtures = new BCSocket 'fixtures'

  before ->
    @connection = @alice = new Connection(new BCSocket)
    @bob = new Connection(new BCSocket)

    @alice.on 'error', (e)-> throw e
    @bob.on 'error', (e)-> throw e

  after ->
    @alice.socket.close()
    delete @alice
    @bob.socket.close()
    delete @bob


  # Reset documents
  beforeEach (done)->
    fixtures.onmessage = ->
      fixtures.onmessage = undefined
      done()
    fixtures.send('reset')

    @alice.collections = {}
    @bob.collections = {}


  describe '#create', ->

    it 'creates a document', (done)->
      doc = @connection.get('garage', 'porsche')
      doc.create 'json0', {color: 'red'}, false, done

    it 'creates a document with data', (done)->
      doc = @alice.get('garage', 'porsche')
      doc.create 'json0', {color: 'red'}, false, =>
        doc2 = @bob.get('garage', 'porsche')
        doc2.fetch (error)->
          assert.deepEqual doc2.snapshot, color: 'red'
          done(error)
