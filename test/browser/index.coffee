mocha.setup('bdd')
phantom = require '../helpers/phantom'
require './connection'
require './doc'

mocha.run().on 'end', ->
  phantom('finished', this.failures)
