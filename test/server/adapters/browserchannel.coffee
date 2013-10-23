expect = require('chai').expect
BCStream = require('../../../lib/').adapters.BCStream

noop = ->

describe 'browserchannel stream adapter', ->

  it 'exists', ->
    expect(BCStream).to.exist

  it 'can be instantiated with new', ->
    expect(new BCStream({on: noop})).to.be.an.instanceof BCStream

  it 'throws when no connection is provided', ->
    expect(-> new BCStream).to.throw 'No connection object provided.'

  it 'gets the readyState from the underlying connection.state', ->
    s = new BCStream({on: noop, state: 'init'})
    expect(s).to.have.property 'readyState', 'init'

  it 'takes an options debug argument', ->
    s = new BCStream({on: noop}, {debug: yes})
    expect(s).to.have.property 'debug', yes
