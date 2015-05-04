# Communicate with phantom if available
if window? && window.callPhantom

  Function.prototype.bind = (object)->
    => this.apply(object, arguments)


  phantom = (type, args...)->
    if args.length > 0
      window.callPhantom [type].concat(args)
    else
      (args...)-> window.callPhantom [type].concat(args)

  module.exports = phantom
  module.exports.available = true
else
  module.exports = ->
  module.exports.available = false
