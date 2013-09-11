# This is some utility code to connect an ace editor to a sharejs document.

requireImpl = if ace.require? then ace.require else require
Range = requireImpl("ace/range").Range

# Convert an ace delta into an op understood by share.js
applyToShareJS = (editorDoc, delta, doc) ->
  # Get the start position of the range, in no. of characters
  getStartOffsetPosition = (range) ->
    # This is quite inefficient - getLines makes a copy of the entire
    # lines array in the document. It would be nice if we could just
    # access them directly.
    lines = editorDoc.getLines 0, range.start.row
      
    offset = 0

    for line, i in lines
      offset += if i < range.start.row
        line.length
      else
        range.start.column

    # Add the row number to include newlines.
    offset + range.start.row

  pos = getStartOffsetPosition(delta.range)
  switch delta.action
    when 'insertText' then doc.insert pos, delta.text
    when 'removeText' then doc.del pos, delta.text.length
    
    when 'insertLines'
      text = delta.lines.join('\n') + '\n'
      doc.insert pos, text
      
    when 'removeLines'
      text = delta.lines.join('\n') + '\n'
      doc.del pos, text.length

    else throw new Error "unknown action: #{delta.action}"
  
  return

# Attach an ace editor to the document. The editor's contents are replaced
# with the document's contents unless keepEditorContents is true. (In which case the document's
# contents are nuked and replaced with the editor's).
window.sharejs.extendDoc 'attach_ace', (editor, keepEditorContents) ->
  throw new Error 'Only text documents can be attached to ace' unless @provides['text']

  doc = this
  editorDoc = editor.getSession().getDocument()
  editorDoc.setNewLineMode 'unix'

  check = ->
    window.setTimeout ->
        editorText = editorDoc.getValue()
        otText = doc.getText()

        if editorText != otText
          console.error "Text does not match!"
          console.error "editor: #{editorText}"
          console.error "ot:     #{otText}"
          # Should probably also replace the editor text with the doc snapshot.
      , 0

  if keepEditorContents
    doc.del 0, doc.getText().length
    doc.insert 0, editorDoc.getValue()
  else
    editorDoc.setValue doc.getText()

  check()

  # When we apply ops from sharejs, ace emits edit events. We need to ignore those
  # to prevent an infinite typing loop.
  suppress = false
  
  # Listen for edits in ace
  editorListener = (change) ->
    return if suppress
    applyToShareJS editorDoc, change.data, doc

    check()

  replaceTokenizer = () ->
    oldTokenizer = editor.getSession().getMode().getTokenizer();
    oldGetLineTokens = oldTokenizer.getLineTokens;
    oldTokenizer.getLineTokens = (line, state) ->
      if not state? or typeof state == "string" # first line
        cIter = doc.createIterator(0)
        state =
          modeState : state
      else
        cIter = doc.cloneIterator(state.iter)
        doc.consumeIterator(cIter, 1) # consume the \n from previous line

      modeTokens = oldGetLineTokens.apply(oldTokenizer, [line, state.modeState]);
      docTokens = doc.consumeIterator(cIter, line.length);
      if (docTokens.text != line)
        return modeTokens;

      return {
        tokens : doc.mergeTokens(docTokens, modeTokens.tokens)
        state : 
          modeState : modeTokens.state
          iter : doc.cloneIterator(cIter)
      }

  replaceTokenizer() if doc.getAttributes?

  editorDoc.on 'change', editorListener

  # Listen for remote ops on the sharejs document
  docListener = (op) ->
    suppress = true
    applyToDoc editorDoc, op
    suppress = false

    check()


  # Horribly inefficient.
  offsetToPos = (offset) ->
    # Again, very inefficient.
    lines = editorDoc.getAllLines()

    row = 0
    for line, row in lines
      break if offset <= line.length

      # +1 for the newline.
      offset -= lines[row].length + 1

    row:row, column:offset

  doc.on 'insert', insertListener = (pos, text) ->
    suppress = true
    editorDoc.insert offsetToPos(pos), text
    suppress = false
    check()

  doc.on 'delete', deleteListener = (pos, text) ->
    suppress = true
    range = Range.fromPoints offsetToPos(pos), offsetToPos(pos + text.length)
    editorDoc.remove range
    suppress = false
    check()

  doc.on 'refresh', refreshListener = (startoffset, length) ->
    range = Range.fromPoints offsetToPos(startoffset), offsetToPos(startoffset + length)
    editor.getSession().bgTokenizer.start(range.start.row)

  doc.detach_ace = ->
    doc.removeListener 'insert', insertListener
    doc.removeListener 'delete', deleteListener
    doc.removeListener 'remoteop', docListener
    doc.removeListener 'refresh', refreshListener
    editorDoc.removeListener 'change', editorListener
    delete doc.detach_ace

  return

