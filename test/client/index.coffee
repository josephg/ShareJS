assert = require 'assert'
client = require('../../lib').client

describe 'client index', ->
  it 'exports share.version in the client', ->
    version = require('../../package.json').version
    assert.strictEqual version, client.version
