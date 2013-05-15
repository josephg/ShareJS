# This is some utility code to connect a CodeMirror editor
# to a sharejs document.
# It is heavily inspired from the Ace editor hook.

# Convert a CodeMirror delta into an op understood by share.js
applyToShareJS = (editorDoc, delta, doc) ->
  # CodeMirror deltas give a text replacement.
  # I tuned this operation a little bit, for speed.
  startPos = 0  # Get character position from # of chars in each line.
  i = 0         # i goes through all lines.

  while i < delta.from.line
    startPos += editorDoc.lineInfo(i).text.length + 1   # Add 1 for '\n'
    i++

  startPos += delta.from.ch

  if delta.to.line == delta.from.line &&
     delta.to.ch == delta.from.ch # Then nothing was removed.
    doc.insert startPos, delta.text.join '\n'
  else
    # delete.removed contains an array of removed lines as strings, so this adds
    # all the lengths. Later delta.removed.length - 1 is added for the \n-chars
    # (-1 because the linebreak on the last line won't get deleted)
    delLen = 0
    for rm in delta.removed
      delLen += rm.length
    delLen += delta.removed.length - 1

    doc.del startPos, delLen
    doc.insert startPos, delta.text.join '\n' if delta.text

  applyToShareJS editorDoc, delta.next, doc if delta.next

# Attach a CodeMirror editor to the document. The editor's contents are replaced
# with the document's contents unless keepEditorContents is true. (In which case
# the document's contents are nuked and replaced with the editor's).
window.sharejs.extendDoc 'attach_cm', (editor, keepEditorContents) ->
  unless @provides.text
    throw new Error 'Only text documents can be attached to CodeMirror 2 or 3'

  sharedoc = @
  check = ->
    window.setTimeout ->
        editorText = editor.getValue('\n')
        otText = sharedoc.getText()

        if editorText != otText
          console.error "Text does not match!"
          console.error "editor: #{editorText}"
          console.error "ot:     #{otText}"
          # Replace the editor text with the doc snapshot.
          editor.setValue sharedoc.getText()
      , 0

  if keepEditorContents
    @del 0, sharedoc.getText('\n').length
    @insert 0, editor.getValue()
  else
    editor.setValue sharedoc.getText()

  check()

  # When we apply ops from sharejs, CodeMirror emits edit events.
  # We need to ignore those to prevent an infinite typing loop.
  suppress = false

  # Listen for edits in CodeMirror.
  editorListener = (ed, change) ->
    return if suppress
    applyToShareJS editor, change, sharedoc

    check()

  editor.on 'change', editorListener

  @on 'insert', (pos, text) ->
    suppress = true
    # All the primitives we need are already in CM's API.
    editor.replaceRange text, editor.posFromIndex(pos)
    suppress = false
    check()

  @on 'delete', (pos, text) ->
    suppress = true
    from = editor.posFromIndex pos
    to = editor.posFromIndex (pos + text.length)
    editor.replaceRange '', from, to
    suppress = false
    check()

  @detach_cm = ->
    # TODO: can we remove the insert and delete event callbacks?
    editor.off 'change', editorListener
    delete @detach_cm

  return

