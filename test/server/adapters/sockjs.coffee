expect = require('chai').expect
SockStream = require('../../../lib/').adapters.SockStream

noop = ->

describe 'browserchannel stream adapter', ->

  it 'exists', ->
    expect(SockStream).to.exist

  it 'can be instantiated with new', ->
    expect(new SockStream({on: noop})).to.be.an.instanceof SockStream

  it 'throws when no connection is provided', ->
    expect(-> new SockStream).to.throw 'No connection object provided.'

  it 'gets the readyState from the underlying connection.state', ->
    s = new SockStream({on: noop, readyState: 1})
    expect(s).to.have.property 'readyState', 1

  it 'takes an options debug argument', ->
    s = new SockStream({on: noop}, {debug: yes})
    expect(s).to.have.property 'debug', yes
