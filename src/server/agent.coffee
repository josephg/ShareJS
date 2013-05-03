hat = require 'hat'
livedb = require 'livedb'

module.exports = (options, stream) ->
  # Session id should be exposed back to racer / whatever
  # stream should be exposed to auth function
  # this should return synchronously because the client/server wrapper can do its own auth check anyway.
  
  db = options.db
  backend = livedb.client db

  agent =
    sessionId: hat()

  for fn in ['fetch', 'subscribe', 'submit', 'queryFetch', 'query', 'fetchAndSubscribe', 'getOps']
    do (fn) ->
      agent[fn] = (args...) -> backend[fn](args...)

  agent
