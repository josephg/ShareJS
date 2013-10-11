mocha.setup('bdd')

phantom = require '../helpers/phantom'

require './connection'
require './doc'

if phantom.available
  console.log   = phantom('console')
  console.error = phantom('console')
  Mocha.process.stdout.write = phantom('write')
  mocha.reporter('spec')


mocha.run().on 'end', ->
  phantom('finished', this.failures)
