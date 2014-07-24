sharejs = require '../lib'
fs = require 'fs'
assert = require 'assert'

describe 'index', ->
  it 'exports the client scripts directory', ->
    assert fs.existsSync "#{sharejs.scriptsDir}/share.js"
