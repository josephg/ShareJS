sharejs = require '../lib'
fs = require 'fs'
assert = require 'assert'

it 'exports the client scripts directory', ->
  assert fs.existsSync "#{sharejs.scriptsDir}/share.js"

