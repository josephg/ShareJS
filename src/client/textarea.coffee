# Create an op which converts oldval -> newval.
#
# This function should be called every time the text element is changed. Because changes are
# always localised, the diffing is quite easy.
#
# This algorithm is O(N), but I suspect you could speed it up somehow using regular expressions.
applyChange = (ctx, oldval, newval) ->
  return if oldval == newval
  commonStart = 0
  commonStart++ while oldval.charAt(commonStart) == newval.charAt(commonStart)

  commonEnd = 0
  commonEnd++ while oldval.charAt(oldval.length - 1 - commonEnd) == newval.charAt(newval.length - 1 - commonEnd) and
    commonEnd + commonStart < oldval.length and commonEnd + commonStart < newval.length

  ctx.remove commonStart, oldval.length - commonStart - commonEnd unless oldval.length == commonStart + commonEnd
  ctx.insert commonStart, newval[commonStart ... newval.length - commonEnd] unless newval.length == commonStart + commonEnd

window.sharejs.Doc::attach_textarea = (elem) ->
  ctx = null

  replaceText = (newText, transformCursor) ->
    newSelection = [
      transformCursor elem.selectionStart
      transformCursor elem.selectionEnd
    ]

    scrollTop = elem.scrollTop
    elem.value = newText
    elem.scrollTop = scrollTop if elem.scrollTop != scrollTop
    [elem.selectionStart, elem.selectionEnd] = newSelection if window.document.activeElement is elem

  insert_listener = (pos, text) ->
    transformCursor = (cursor) ->
      if pos < cursor
        cursor + text.length
      else
        cursor
    #for IE8 and Opera that replace \n with \r\n.
    prevvalue = elem.value.replace /\r\n/g, '\n'
    replaceText prevvalue[...pos] + text + prevvalue[pos..], transformCursor
  
  remove_listener = (pos, length) ->
    transformCursor = (cursor) ->
      if pos < cursor
        cursor - Math.min(length, cursor - pos)
      else
        cursor
    #for IE8 and Opera that replace \n with \r\n.
    prevvalue = elem.value.replace /\r\n/g, '\n'
    replaceText prevvalue[...pos] + prevvalue[pos + length..], transformCursor

  genOp = (event) ->
    onNextTick = (fn) -> setTimeout fn, 0
    onNextTick ->
      if elem.value != prevvalue
        # IE constantly replaces unix newlines with \r\n. ShareJS docs
        # should only have unix newlines.
        prevvalue = elem.value
        applyChange ctx, ctx.getText(), elem.value.replace /\r\n/g, '\n'

  attach = ->
    return console?.warn 'Could not attach document: text api incompatible' unless doc.provides.text
    ctx = doc.createEditingContext()

    console.log 'attach', ctx
    prevvalue = elem.value = ctx.getText()
    ctx.onInsert = insert_listener
    ctx.onRemove = remove_listener

    for event in ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste']
      if elem.addEventListener
        elem.addEventListener event, genOp, false
      else
        elem.attachEvent 'on'+event, genOp

    doc.once 'deleted', detach

  detach = elem.detach_share = ->
    ctx.onInsert = ctx.onRemove = null

    for event in ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste']
      if elem.removeEventListener
        elem.removeEventListener event, genOp, false
      else
        elem.detachEvent 'on'+event, genOp

    #elem.disabled = true
    doc.once 'ready', attach


  if doc.type
    attach()
  else
    doc.once 'ready', attach

