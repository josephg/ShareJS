{BCSocket} = require('bcsocket')

# Control documents on the server
#
#   fix = require('fixtures')()
#   fix.reset -> 'fixtures reseted'
#
module.exports = ->
  socket: (new BCSocket 'fixtures')
  reset: (done)->
    @socket.onmessage = =>
      @socket.onmessage = undefined
      done()
    @socket.send('reset')
