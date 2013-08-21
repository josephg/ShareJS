# Tests for the REST-ful interface

assert = require 'assert'
http = require 'http'

rest = require '../lib/server/rest'
ottypes = require 'ottypes'
connect = require 'connect'

# Async fetch. Aggregates whole response and sends to callback.
# Callback should be function(response, data) {...}
fetch = (method, port, path, postData, extraHeaders, callback) ->
  if typeof extraHeaders == 'function'
    callback = extraHeaders
    extraHeaders = null

  headers = extraHeaders || {'x-testing': 'booyah'}

  request = http.request {method, path, host: 'localhost', port, headers}, (response) ->
    data = ''
    response.on 'data', (chunk) -> data += chunk
    response.on 'end', ->
      data = data.trim()
      if response.headers['content-type'] == 'application/json'
        data = JSON.parse(data)

      callback response, data, response.headers

  if postData?
    postData = JSON.stringify(postData) if typeof(postData) == 'object'
    request.write postData

  request.end()

# Frontend tests
describe 'rest', ->
  beforeEach (done) ->
    @collection = '__c'
    @doc = '__doc'

    # Tests fill this in to provide expected backend functionality
    @docs = {}
    @ops = {}
    @userAgent =
      fetch: (cName, docName, callback) => callback null, @docs[cName]?[docName] ? {v:0}
      getOps: (cName, docName, start, end, callback) =>
        ops = @ops[cName]?[docName] ? []
        start = 0 if start < 0

        if end is null
          callback null, ops.slice start
        else
          return callback null, [] if end <= start
          callback null, ops.slice start, start + end

      sessionId: 'session id' # The unique client ID
      trigger: (a, b, c, d, callback) -> callback()

    @instance =
      createAgent: (req) => @userAgent

    app = connect()
    app.use '/doc', rest(@instance)
    @port = 4321
    @server = app.listen @port, done

  afterEach (done) ->
    @server.on 'close', done
    @server.close()

  describe 'GET/HEAD', ->
    it 'returns 404 for nonexistant documents', (done) ->
      fetch 'GET', @port, "/doc/#{@collection}/#{@name}", null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 404
        assert.strictEqual headers['x-ot-version'], '0'
        assert.equal headers['x-ot-type'], null
        done()
        
    it 'return 404 and empty body when on HEAD on a nonexistant document', (done) ->
      fetch 'HEAD', @port, "/doc/#{@collection}/#{@name}", null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 404
        assert.strictEqual data, ''
        assert.strictEqual headers['x-ot-version'], '0'
        assert.equal headers['x-ot-type'], null
        done()
    
    it 'returns 200, empty body, version and type when on HEAD on a document', (done) ->
      @docs.c = {}
      @docs.c.d = {v:1, type:ottypes.text.uri, data:'hi there'}

      fetch 'HEAD', @port, "/doc/c/d", null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.strictEqual headers['x-ot-version'], '1'
        assert.strictEqual headers['x-ot-type'], ottypes.text.uri
        assert.strictEqual data, ''
        done()
            
    it 'document returns the document snapshot', (done) ->
      @docs.c = {}
      @docs.c.d = {v:1, type:ottypes.simple.uri, data:{str:'Hi'}}

      fetch 'GET', @port, "/doc/c/d", null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.strictEqual headers['x-ot-version'], '1'
        assert.strictEqual headers['x-ot-type'], ottypes.simple.uri
        assert.strictEqual headers['content-type'], 'application/json'
        assert.deepEqual data, {str:'Hi'}
        done()

    it 'a plaintext document is returned as a string', (done) ->
      @docs.c = {}
      @docs.c.d = {v:1, type:ottypes.text.uri, data:'hi'}

      fetch 'GET', @port, "/doc/c/d", null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.strictEqual headers['x-ot-version'], '1'
        assert.strictEqual headers['x-ot-type'], ottypes.text.uri
        assert.strictEqual headers['content-type'], 'text/plain'
        assert.deepEqual data, 'hi'
        done()

  describe 'GET /ops', ->
    it 'returns ops', (done) ->
      @ops.c = {}
      ops = @ops.c.d = [{v:0, create:{type:ottypes.text.uri}}, {v:1, op:[]}, {v:2, op:[]}]
      fetch 'GET', @port, '/doc/c/d/ops', null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, ops
        done()

    it 'limits FROM based on query parameter', (done) ->
      @ops.c = {}
      ops = @ops.c.d = [{v:0, create:{type:ottypes.text.uri}}, {v:1, op:[]}, {v:2, op:[]}]
      fetch 'GET', @port, '/doc/c/d/ops?to=2', null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, [ops[0], ops[1]]
        done()

    it 'limits TO based on query parameter', (done) ->
      @ops.c = {}
      ops = @ops.c.d = [{v:0, create:{type:ottypes.text.uri}}, {v:1, op:[]}, {v:2, op:[]}]
      fetch 'GET', @port, '/doc/c/d/ops?from=1', null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, [ops[1], ops[2]]
        done()

    it 'returns empty list for nonexistant document', (done) ->
      fetch 'GET', @port, '/doc/c/d/ops', null, (res, data, headers) ->
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, []
        done()

  # Tests past this line haven't been rewritten yet for the new API.

  describe.skip 'PUT', ->
    it 'PUT a document creates it', (done) ->
      fetch 'PUT', @port, "/doc/c/d", {type:'simple'}, (res, data) =>
        assert.strictEqual res.statusCode, 200

        @model.getSnapshot @name, (error, doc) ->
          meta = doc.meta
          delete doc.meta
          assert.deepEqual doc, {v:0, type:types.simple, snapshot:{str:''}}
          test.ok meta
          assert.strictEqual typeof(meta.ctime), 'number'
          assert.strictEqual typeof(meta.mtime), 'number'
          done()

  'POST a document in the DB returns 200 OK': (test) ->
    @model.create @name, 'simple', =>
      fetch 'POST', @port, "/doc/#{@name}?v=0", {position: 0, text: 'Hi'}, (res, data) =>
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, {v:0}

        @model.getSnapshot @name, (error, doc) ->
          assert.deepEqual doc, {v:1, type:types.simple, snapshot:{str:'Hi'}, meta:{}}
          done()
  
  'POST a document setting the version in an HTTP header works': (test) ->
    @model.create @name, 'simple', =>
      fetch 'POST', @port, "/doc/#{@name}", {position: 0, text: 'Hi'}, {'X-OT-Version': 0}, (res, data) =>
        assert.strictEqual res.statusCode, 200
        assert.deepEqual data, {v:0}

        @model.getSnapshot @name, (error, doc) ->
          assert.deepEqual doc, {v:1, type:types.simple, snapshot:{str:'Hi'}, meta:{}}
          done()
  
  'POST a document with no version returns 400': (test) ->
    fetch 'POST', @port, "/doc/#{@name}", {type:'simple'}, (res, data) ->
      assert.strictEqual res.statusCode, 400
      done()

  'POST a document with invalid JSON returns 400': (test) ->
    fetch 'POST', @port, "/doc/#{@name}?v=0", 'invalid>{json', (res, data) ->
      assert.strictEqual res.statusCode, 400
      done()
  
  "Can't POST an op to a nonexistant document": (test) ->
    # This was found in the wild -
    # https://github.com/josephg/ShareJS/issues/66
    fetch 'POST', @port, "/doc/#{@name}?v=0", {foo:'bar'}, (res, data) ->
      assert.strictEqual res.statusCode, 404
      done()
    
  'DELETE deletes a document': (test) ->
    @model.create @name, 'simple', =>
      fetch 'DELETE', @port, "/doc/#{@name}", null, (res, data) =>
        assert.strictEqual res.statusCode, 200

        @model.getSnapshot @name, (error, doc) ->
          test.equal doc, null
          done()
  
  'DELETE returns a 404 message if you delete something that doesn\'t exist': (test) ->
    fetch 'DELETE', @port, "/doc/#{@name}", null, (res, data) ->
      assert.strictEqual res.statusCode, 404
      done()

  'Cannot do anything if the server doesnt allow client connections': (test) ->
    @auth = (agent, action) ->
      assert.strictEqual action.type, 'connect'
      test.ok agent.remoteAddress in ['localhost', '127.0.0.1'] # Is there a nicer way to do this?
      assert.strictEqual typeof agent.sessionId, 'string'
      test.ok agent.sessionId.length > 5
      test.ok agent.connectTime

      assert.strictEqual typeof agent.headers, 'object'

      # This is added above
      assert.strictEqual agent.headers['x-testing'], 'booyah'

      action.reject()

    passPart = makePassPart test, 7
    checkResponse = (res, data) ->
      assert.strictEqual(res.statusCode, 403)
      assert.deepEqual data, 'Forbidden'
      passPart()

    # Non existant document
    doc1 = newDocName()

    # Get
    fetch 'GET', @port, "/doc/#{doc1}", null, checkResponse

    # Create
    fetch 'PUT', @port, "/doc/#{doc1}", {type:'simple'}, checkResponse

    # Submit an op to a nonexistant doc
    fetch 'POST', @port, "/doc/#{doc1}?v=0", {position: 0, text: 'Hi'}, checkResponse

    # Existing document
    doc2 = newDocName()
    @model.create doc2, 'simple', =>
      @model.applyOp doc2, {v:0, op:{position: 0, text: 'Hi'}}, =>
        fetch 'GET', @port, "/doc/#{doc2}", null, checkResponse
    
        # Create an existing document
        fetch 'PUT', @port, "/doc/#{doc2}", {type:'simple'}, checkResponse

        # Submit an op to an existing document
        fetch 'POST', @port, "/doc/#{doc2}?v=0", {position: 0, text: 'Hi'}, checkResponse

        # Delete a document
        fetch 'DELETE', @port, "/doc/#{doc2}", null, checkResponse

  "Can't GET if read is rejected": (test) ->
    @auth = (client, action) -> if action.type == 'read' then action.reject() else action.accept()

    @model.create @name, 'simple', =>
      @model.applyOp @name, {v:0, op:{position: 0, text: 'Hi'}}, =>
        fetch 'GET', @port, "/doc/#{@name}", null, (res, data) ->
          assert.strictEqual(res.statusCode, 403)
          assert.deepEqual data, 'Forbidden'
          done()

  "Can't PUT if create is rejected": (test) ->
    @auth = (client, action) -> if action.type == 'create' then action.reject() else action.accept()

    fetch 'PUT', @port, "/doc/#{@name}", {type:'simple'}, (res, data) =>
      assert.strictEqual res.statusCode, 403
      assert.deepEqual data, 'Forbidden'

      @model.getSnapshot @name, (error, doc) ->
        test.equal doc, null
        done()

  "Can't POST if submit op is rejected": (test) ->
    @auth = (client, action) -> if action.type == 'update' then action.reject() else action.accept()

    @model.create @name, 'simple', =>
      fetch 'POST', @port, "/doc/#{@name}?v=0", {position: 0, text: 'Hi'}, (res, data) =>
        assert.strictEqual res.statusCode, 403
        assert.deepEqual data, 'Forbidden'

        # & Check the document is unchanged
        @model.getSnapshot @name, (error, doc) ->
          assert.deepEqual doc, {v:0, type:types.simple, snapshot:{str:''}, meta:{}}
          done()

  'A Forbidden DELETE on a nonexistant document returns 403': (test) ->
    @auth = (client, action) -> if action.type == 'delete' then action.reject() else action.accept()

    fetch 'DELETE', @port, "/doc/#{@name}", null, (res, data) ->
      assert.strictEqual res.statusCode, 403
      assert.deepEqual data, 'Forbidden'
      done()

  "Can't DELETE if delete is rejected": (test) ->
    @auth = (client, action) -> if action.type == 'delete' then action.reject() else action.accept()

    @model.create @name, 'simple', =>
      fetch 'DELETE', @port, "/doc/#{@name}", null, (res, data) =>
        assert.strictEqual res.statusCode, 403
        assert.deepEqual data, 'Forbidden'

        @model.getSnapshot @name, (error, doc) ->
          test.ok doc
          done()


