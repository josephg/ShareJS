
describe.skip 'subscribe unsubscribe and fetch', ->
  it 'subscribes', ->

  it 'unsubscribes', ->

  it 'subscribes once and calls all callbacks when subscribe is called multiple times', ->

  it 'unsubscribes once and calls all callbacks when unsubscribe is called multiple times', ->

  it 'calls subscribe callbacks when unsubscribe is called before subscribing', ->


  describe 'fetch', ->
    it "fetches a snapshot when we don't have data", ->

    it 'fetches ops when we have data', ->

    it 'just calls the callback when we are subscribed', ->

    it 'calls all callbacks when fetch is called multiple times', ->

  it 'hydrates the document if you call getOrCreate() with no data followed by getOrCreate() with data'

describe.skip 'ops', ->
  it 'creates a document', ->

  it 'sends an op to the server', ->

  it 'deletes a document', ->

  it 'only sends one op to the server if ops are sent synchronously', ->

  describe 'rollback', ->
    it "rolls back a create when we're ready and the server rejects the op", ->

    it "rolls back a create when the doc is floating and the document already exists on the server", ->

    it 'sets state back to null when a floating document is rolled back', ->

    it 'ends up in the right state if we create() then subscribe() synchronously'
    
    it "applys an op's inverse if the op is rejected", ->

    it "abandons the document state if we can't recover from the rejected op", ->

  it 'reorders sent (but not acknowledged) operations on reconnect', ->

