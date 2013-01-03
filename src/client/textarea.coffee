# Create an op which converts oldval -> newval.
#
# This function should be called every time the text element is changed. Because changes are
# always localised, the diffing is quite easy.
#
# This algorithm is O(N), but I suspect you could speed it up somehow using regular expressions.
applyChange = (doc, oldval, newval, cursor) ->
  return if oldval == newval
  commonEnd = 0
  commonEnd++ while oldval.charAt(oldval.length - 1 - commonEnd) == newval.charAt(newval.length - 1 - commonEnd) and
    commonEnd < oldval.length and commonEnd < newval.length and cursor + commonEnd < newval.length

  commonStart = 0
  commonStart++ while oldval.charAt(commonStart) == newval.charAt(commonStart) and
    commonEnd + commonStart < oldval.length and commonEnd + commonStart < newval.length

  doc.del commonStart, oldval.length - commonStart - commonEnd unless oldval.length == commonStart + commonEnd
  doc.insert commonStart, newval[commonStart ... newval.length - commonEnd] unless newval.length == commonStart + commonEnd

window.sharejs.extendDoc 'attach_textarea', (elem) ->
  window.e = elem

  doc = this
  elem.value = @getText()
  prevvalue = elem.value
  @setCursor elem.selectionStart

  ctx = document.getCSSCanvasContext '2d', 'cursors', elem.offsetWidth, elem.offsetHeight
  drawCursors = ->
    div = document.createElement 'div'
    text = div.appendChild document.createTextNode elem.value

    div.style.width = "#{elem.offsetWidth}px"
    div.style.height = "#{elem.offsetHeight}px"
    cs = getComputedStyle elem
    div.style[k] = v for k,v of cs

    document.body.appendChild div

    getPos = (pos) ->
      span = document.createElement('span')
      if pos == 0
        if elem.value.length
          div.insertBefore span, text
        else
          div.appendChild span
      else if pos < elem.value.length
        remainder = text.splitText c
        div.insertBefore span, remainder
      else
        div.appendChild span

      #span.innerText = ' '

      divrect = div.getBoundingClientRect()
      spanrect = span.getBoundingClientRect()

      x = spanrect.left - divrect.left
      y = spanrect.top - divrect.top
      h = spanrect.height

      div.removeChild span
      div.normalize() # join the text nodes back up

      {x, y, h}


    ctx.clearRect 0, 0, elem.offsetWidth, elem.offsetHeight
    for id, c of doc.cursors
      c = c[1] unless typeof c is 'number'

      try
        pos = getPos c

        #console.log pos

        ctx.fillStyle = "hsl(#{id * 41 % 360}, 90%, 34%)"
        ctx.fillRect Math.round(pos.x-1), pos.y - elem.scrollTop-1, 2, pos.h
      catch e
        console.error e.stack


    document.body.removeChild div

  drawCursors()

  replaceText = (newText) ->
    scrollTop = elem.scrollTop
    elem.value = newText
    elem.scrollTop = scrollTop if elem.scrollTop != scrollTop

    if typeof doc.cursor is 'number'
      elem.selectionStart = elem.selectionEnd = doc.cursor
    else
      [anchor, focus] = doc.cursor
      if anchor < focus
        [elem.selectionStart, elem.selectionEnd] = [anchor, focus]
      else
        [elem.selectionStart, elem.selectionEnd] = [focus, anchor]
        elem.selectionDirection = 'backward'

  @on 'insert', insertListener = (pos, text) ->
    #for IE8 and Opera that replace \n with \r\n.
    prevvalue = elem.value.replace /\r\n/g, '\n'
    replaceText prevvalue[...pos] + text + prevvalue[pos..]
  
  @on 'delete', deleteListener = (pos, text) ->
    #for IE8 and Opera that replace \n with \r\n.
    prevvalue = elem.value.replace /\r\n/g, '\n'
    replaceText prevvalue[...pos] + prevvalue[pos + text.length..]

  @on 'cursors', drawCursors

  checkForChanges = (event) ->
    setTimeout ->
        if elem.selectionStart == elem.selectionEnd
          doc.setCursor elem.selectionStart
        else
          if elem.selectionDirection is 'backward'
            doc.setCursor [elem.selectionEnd, elem.selectionStart]
          else
            doc.setCursor [elem.selectionStart, elem.selectionEnd]

        if elem.value != prevvalue
          # IE constantly replaces unix newlines with \r\n. ShareJS docs
          # should only have unix newlines.
          prevvalue = elem.value
          applyChange doc, doc.getText(), elem.value.replace(/\r\n/g, '\n'), elem.selectionEnd
          drawCursors()
      , 0

  events = ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste', 'click', 'focus']
  for event in events
    if elem.addEventListener
      elem.addEventListener event, checkForChanges, false
    else
      elem.attachEvent 'on'+event, checkForChanges

  elem.detach_share = =>
    @removeListener 'insert', insertListener
    @removeListener 'delete', deleteListener
    @removeListener 'cursors', drawCursors

    for event in events
      if elem.removeEventListener
        elem.removeEventListener event, checkForChanges, false
      else
        elem.detachEvent 'on'+event, checkForChanges
