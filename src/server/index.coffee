session = require './session'
livedb = require 'livedb'

exports.createClient = (options) ->

  listen: (stream) -> session(options, stream)

exports.db =
  mongo: livedb.mongo
