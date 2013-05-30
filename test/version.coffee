assert = require 'assert'
node = require '../lib'
# Not testing the web stuff for now.
#web = require './helpers/webclient'

pkg = require '../package.json'

describe 'version', ->
  it 'should match require("share").version', ->
    assert.ok node.version
    assert.strictEqual node.version, pkg.version

  it.skip 'should match share.version in the browser', ->
    assert.strictEqual web.version, pkg.version
