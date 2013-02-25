# Text document API for text
# :tabSize=2:indentSize=2:

if WEB? 
  if window.ShareJS? && window.ShareJS.Changeset?
    Changeset = window.ShareJS.Changeset
    AttributePool = window.ShareJS.AttributePool
  else
    console.log("Etherpad library not found. Make sure to include Attributepool.js and Changeset.js in your javascript sourcecode");
else 
  etherpad = require './etherpad'
  AttributePool = require './../lib-etherpad/AttributePool.js'  
  Changeset = require './../lib-etherpad/Changeset.js'

etherpad.api =
  provides:  { text:true }

  # The number of characters in the string
  getLength: -> @snapshot.text.length

  # Get the text contents of a document
  getText: -> @snapshot.text

  mergeTokens: (text, line, modeTokens) ->
    parserPool = new AttributePool();
    parserAttributes = Changeset.builder(text.length + 1);
    for attr in modeTokens
      parserAttributes.keep(attr.value.length, 0, [[attr.type, true]], parserPool);
    parserCS = parserAttributes.toString()
    @snapshot.alines[line] = "" if not @snapshot.alines[line] 
    docCS = Changeset.pack(text.length+1, text.length+1, @snapshot.alines[line].replace(/\+/g,"="), "")
    docCS = Changeset.moveOpsToNewPool(docCS, @snapshot.pool, parserPool);

    resultCS = Changeset.unpack(Changeset.compose(parserCS, docCS, parserPool));
    iter = Changeset.opIterator(resultCS.ops);
    tokens = [];
    tIndex = 0;
    stringIter = Changeset.stringIterator(text);
    while (iter.hasNext())
      op = iter.next();
      str = ""; first = true;
      op.attribs.replace(/\*([0-9a-z]+)/g, (_, a) ->
        pair = parserPool.getAttrib(Changeset.parseNum(a));
        if first
          str += pair[0]
          first = false;
        else
          str += " ace_"+pair[0];
      )
      tokens[tIndex++] = 
        type : str
        value : stringIter.take(op.chars);
    tokens

  trackLines: ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?
    if not @snapshot.lines?
      @snapshot.lines = [""];
      @snapshot.alines = [""];
      cs = Changeset.pack(@getLength(), @getLength(), @snapshot.attribs, @snapshot.text);
      Changeset.mutateTextLines(cs, @snapshot.lines);
      Changeset.mutateAttributionLines(cs, @snapshot.alines, @snapshot.pool);

  updateLines: (op) ->
    return if not @snapshot.lines?
    Changeset.mutateTextLines(op.changeset, @snapshot.lines);
    Changeset.mutateAttributionLines(op.changeset, @snapshot.alines, op.pool);

  # add attributes [[key1, val1], [key2, val2], ...] to the range starting at offset and with length length
  setAttributes: (startOffset, length, attribs, callback) ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?
    L1 = @linesToPos(startOffset);
    L2 = @linesToPos(startOffset+length) - L1;
    op = 
      pool : new AttributePool()
    op.changeset = Changeset.builder(@getLength()).keep(startOffset, L1).keep(length, L2, attribs, op.pool).toString();
    @updateLines(op);
    @emit 'refresh', startOffset, length
    @submitOp op, callback

  # getAttributes 
  getAttributes: (startOffset, length) ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?

  linesToPos : (pos) ->
    return 0 if pos == 0
    cnt = 0;
    @snapshot.text[0..pos-1].replace("\n", () -> cnt++);
    cnt

  insert: (pos, text, callback) ->
    L = @linesToPos(pos);
    result = {};
    result.pool = new AttributePool();
    result.changeset = Changeset.builder(@snapshot.text.length)
              .keep(pos,L).insert(text, "", result.pool).toString()
    @updateLines(result);
    @submitOp result, callback
    result
  
  del: (pos, length, callback) ->
    L1 = @linesToPos(pos);
    L2 = @linesToPos(pos+length) - L1;
    result = {};
    result.pool = new AttributePool()
    result.changeset = Changeset.builder(@snapshot.text.length).keep(pos,L1).remove(length,L2).toString()
    @updateLines(result);
    @submitOp result, callback
    result
  
  _register: ->
    @on 'remoteop', (op) ->
      unpacked = Changeset.unpack(op.changeset);
      @updateLines(op);
      iter = Changeset.opIterator(unpacked.ops)
      strIter = Changeset.stringIterator(unpacked.charBank);
      offset = 0; 
      refreshFirstOffset = 10000000;
      refreshLastOffset = -1;
      while iter.hasNext()
        o = iter.next()
        switch (o.opcode) 
          when '+'  
            @emit 'insert', offset, strIter.take(o.chars);
            offset = offset + o.chars
          when '-' 
            @emit 'delete', offset, { length: o.chars }
          when '='
            if o.attribs.length > 0
              refreshFirstOffset = Math.min(offset, refreshFirstOffset);
              refreshLastOffset = Math.max(offset + o.chars, refreshLastOffset);
            offset = offset + o.chars
        if (refreshLastOffset > 0)
          @emit 'refresh', refreshFirstOffset, refreshLastOffset - refreshFirstOffset

exports.etherpad = etherpad