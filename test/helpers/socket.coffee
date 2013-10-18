{BCSocket} = require('browserchannel/dist/bcsocket')

module.exports = (url = 'http://localhost:3000/channel')->
  new BCSocket(url)
