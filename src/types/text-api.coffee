# Text document API for text

if WEB?
  type = ottypes.text
else
  type = require './text'

type.api =
  provides: {text:true}

  # The number of characters in the string
  getLength: -> @getSnapshot().length

  # Get the text contents of a document
  getText: -> @getSnapshot()

  insert: (pos, text, callback) ->
    op = type.normalize [pos, text]
    
    @submitOp op, callback
    op
  
  remove: (pos, length, callback) ->
    op = type.normalize [pos, d:length]

    @submitOp op, callback
    op

  _onOp: (op, isLocal) ->
    return if isLocal

    pos = spos = 0 # Reported insert position and snapshot position.
    for component in op
      switch typeof component
        when 'number'
          pos += component
          spos += component
        when 'string'
          @emit 'insert', pos, component
          pos += component.length
        when 'object'
          @emit 'remove', pos, component.d
          spos += component.d

