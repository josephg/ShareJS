# These integration tests test the client through to the useragent code. The
# useragent code is not tested here.

assert = require 'assert'
{Duplex, Readable} = require 'stream'
{EventEmitter} = require 'events'
textType = require('ot-text').type

Session = require '../../lib/server/session'
{Connection} = require '../../lib/client'

describe.skip 'integration', ->
  beforeEach ->
    @serverStream = new Duplex objectMode:yes

    @userAgent =
      sessionId: 'session id' # The unique client ID
      fetchAndSubscribe: (collection, doc, callback) =>
        @subscribedCollection = collection
        @subscribedDoc = doc

        return callback @subscribeError if @subscribeError

        @opStream = new Readable objectMode:yes
        @opStream._read = ->
        callback null, {v:100, type:textType, data:'hi there'}, @opStream
      trigger: (a, b, c, d, callback) -> callback()

    @instance =
      createAgent: (stream) =>
        assert.strictEqual stream, @serverStream
        @userAgent

    @clientStream =
      send: (data) =>
        #console.log 'C->S', JSON.stringify data
        @serverStream.push data
      readyState: 0 # Connecting
      close: =>
        @serverStream.emit 'close'
        @serverStream.emit 'end'
        @serverStream.end()

    @serverStream._write = (chunk, encoding, callback) =>
      #console.log 'S->C', JSON.stringify chunk
      @clientStream.onmessage? chunk
      callback()
    @serverStream._read = ->

    @connection = new Connection @clientStream

    @clientStream.readyState = 1 # Connected.
    @clientStream.onopen?()

    @session = new Session @instance, @serverStream

  describe 'connection maintenance', ->
    it 'connects', (done) ->
      checkStuff = =>
        assert.equal @connection.state, 'connected'
        assert.equal @connection.id, 'session id'
        done()

      if @connection.state is 'connected'
        checkStuff()
      else
        @connection.on 'connected', checkStuff

  describe 'document', ->
    describe 'subscribe', ->
      beforeEach ->

      it 'subscribes to a document', (done) ->
        doc = @connection.get 'users', 'seph'
        assert.strictEqual doc.collection, 'users'
        assert.strictEqual doc.name, 'seph'
        assert.strictEqual doc.subscribed, false

        doc.subscribe (err) =>
          assert.equal err, null

          assert.equal doc.state, 'ready'
          assert doc.subscribed

          assert.deepEqual doc.snapshot, 'hi there'
          assert.strictEqual doc.version, 100
          assert.strictEqual doc.type, textType

          assert.strictEqual doc.name, @subscribedDoc
          assert.strictEqual doc.collection, @subscribedCollection

          done()

      it 'passes subscribe errors back to the client', (done) ->
        @subscribeError = 'You require more vespine gas'

        doc = @connection.get 'users', 'seph'
        doc.subscribe (err) =>
          assert.equal err, @subscribeError

          assert.strictEqual doc.name, @subscribedDoc
          assert.strictEqual doc.collection, @subscribedCollection

          assert !doc.subscribed
          assert.equal doc.version, null
          assert.equal doc.type, null

          done()

    describe 'null document', ->
      it.skip 'lets you create', (done) ->
        doc = @connection.get 'users', 'seph'
        doc.submitOp

    describe 'query', ->
      beforeEach ->

      it 'issues a query to the backend', (done) ->
        @userAgent.query = (index, query, opts, callback) ->
          assert.strictEqual index, 'index'
          assert.deepEqual query, {a:5, b:6}
          assert.deepEqual opts, {docMode:'fetch', poll:true, backend:'abc123', versions:{}}
          emitter = new EventEmitter()
          emitter.data = [{data:{x:10}, type:textType.uri, v:100, docName:'docname', c:'collection'}]
          emitter.extra = 'oh hi'
          callback null, emitter

        @connection.createSubscribeQuery 'index', {a:5, b:6}, {docMode:'fetch', poll:true, source:'abc123'}, (err, results, extra) ->
          assert.ifError err
          # Results should contain the single document that the query returned.
          assert.strictEqual results.length, 1
          assert.strictEqual results[0].name, 'docname'
          assert.strictEqual results[0].collection, 'collection'
          assert.deepEqual results[0].snapshot, {x:10}
          assert.strictEqual extra, 'oh hi'
          done()


      describe 'queryfetch', ->
        it 'does not subscribe to the query result set'

      it 'does not fetch query results when docMode is null', (done) ->
        @userAgent.queryFetch = (index, query, opts, callback) ->
          callback null, [{data:{x:10}, type:textType.uri, v:100, docName:'docname', c:'collection'}], 'oh hi'

        @connection.createFetchQuery 'index', {a:5, b:6}, {}, (err, results, extra) ->
          assert.ifError err
          assert.strictEqual results.length, 1
          assert.equal results[0].state, null
          assert.equal results[0].version, null
          assert.equal results[0].snapshot, null
          done()

      it 'fetches query results if docMode is fetch', (done) ->
        @userAgent.queryFetch = (index, query, opts, callback) ->
          callback null, [{data:{x:10}, type:textType.uri, v:100, docName:'docname', c:'collection'}], 'oh hi'

        @connection.createFetchQuery 'index', {a:5, b:6}, {docMode:'fetch'}, (err, results, extra) ->
          assert.ifError err
          assert.strictEqual results.length, 1
          assert.deepEqual results[0].snapshot, {x:10}
          done()

      it 'subscribes to documents if docMode is subscribe', (done) ->
        @userAgent.queryFetch = (index, query, opts, callback) ->
          callback null, [{data:'internet', type:textType.uri, v:100, docName:'docname', c:'collection'}], 'oh hi'

        @userAgent.subscribe = (collection, doc, version, callback) =>
          assert.strictEqual collection, 'collection'
          assert.strictEqual doc, 'docname'
          assert.strictEqual version, 100
          @opStream = new Readable objectMode:yes
          @opStream._read = ->
          callback null, @opStream

        @connection.createFetchQuery 'index', {a:5, b:6}, {docMode:'sub'}, (err, results, extra) =>
          assert.ifError err
          assert.strictEqual results.length, 1
          doc = results[0]
          assert.deepEqual doc.snapshot, 'internet'
          assert.strictEqual doc.subscribed, true
          assert.strictEqual doc.wantSubscribe, true # Probably shouldn't depend on this actually.

          doc.on 'op', (op) ->
            assert.equal doc.snapshot, 'internet are go!'
            done()

          # The document should get operations sent to the opstream.
          @opStream.push {v:100, op:[8, ' are go!']}


      # regression
      it 'subscribes from the version specified if the client has a document snapshot already', (done) ->
        @userAgent.fetch = (collection, docName, callback) ->
          assert.strictEqual collection, 'collection'
          assert.strictEqual docName, 'docname'
          callback null, {v:98, type:textType.uri, data:'old data'}

        doc = @connection.get 'collection', 'docname'

        doc.fetch (err) =>
          throw new Error err if err

          @userAgent.queryFetch = (index, query, opts, callback) ->
            callback null, [{data:'internet', type:textType.uri, v:100, docName:'docname', c:'collection'}], 'oh hi'

          @userAgent.subscribe = (collection, doc, version, callback) =>
            assert.strictEqual collection, 'collection'
            assert.strictEqual doc, 'docname'
            assert.strictEqual version, 98
            @opStream = new Readable objectMode:yes
            @opStream._read = ->
            callback null, @opStream
            process.nextTick =>
              @opStream.push {v:98, op:[]}
              @opStream.push {v:99, op:[]}

          doc.on 'op', (op) ->
            assert doc.version <= 100
            done() if doc.version is 100

          @connection.createFetchQuery 'index', {a:5, b:6}, {docMode:'sub', knownDocs:[doc]}, (err, results, extra) =>


      it 'does not resend document snapshots when you reconnect' # ?? how do we test this at this level of abstraction?

      it 'fetches operations if the client already has a document snapshot at an old version', (done) ->
        @userAgent.fetch = (collection, docName, callback) ->
          assert.strictEqual collection, 'collection'
          assert.strictEqual docName, 'docname'
          callback null, {v:98, type:textType.uri, data:'old data'}

        doc = @connection.get 'collection', 'docname'

        doc.fetch (err) =>
          throw new Error err if err
          @userAgent.getOps = (collection, docName, from, to, callback) ->
            assert.strictEqual collection, 'collection'
            assert.strictEqual docName, 'docname'
            assert.equal from, 98
            assert to is -1 or to is 100
            callback null, [{v:98, op:[]},{v:99, op:[]}] # ops from 98 to 100

          @userAgent.queryFetch = (index, query, opts, callback) ->
            callback null, [{data:'internet', type:textType.uri, v:100, docName:'docname', c:'collection'}]

          @connection.createFetchQuery 'index', {a:5, b:6}, {docMode:'fetch', knownDocs:[doc]}, (err, results, extra) =>
            throw new Error err if err

          doc.on 'op', (op) ->
            assert doc.version <= 100
            done() if doc.version is 100




      it 'does not fetch results which are subscribed by the client'
      it 'subscribes to documents if autosubscribe is true'
      it 'does not double subscribe to documents or anything wierd'
      it 'passes the right error message back if subscribe fails'


      it 'correctly handles concurrent subscribes & queries with subscribe set'
      it 'handles diffs properly when in subscribe mode'
      it 'sets all new documents to be subscribed before calling any callbacks in query diff handler'

      # regression
      it 'does not pass known documents to the change event handler'


      # regression
      it 'emits an error on the connection or document if an exception is thrown in an event handler'


