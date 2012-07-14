
register = (file) ->
  type = require file
  exports[type.name] = type
  try require "#{file}-api"

# Import all the built-in types.
register './simple'
register './count'

register './text'
register './text-composable'
register './text-tp2'

register './json'

# I'm not registering metadata here so its impossible for a client to create a document of type
# 'metadata'. I don't know what would happen if someone tried that, but I bet it would be bad.
