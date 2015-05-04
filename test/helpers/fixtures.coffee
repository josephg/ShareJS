{BCSocket} = require 'browserchannel'

# Control documents on the server
#
#   fix = require('fixtures')()
#   fix.reset -> 'fixtures reseted'
#
module.exports = ->
  socket: (new BCSocket 'http://localhost:3000/fixtures')
  reset: (done)->
    @socket.onmessage = =>
      @socket.onmessage = undefined
      done()
    @socket.send('reset')
  close: -> @socket.close()
