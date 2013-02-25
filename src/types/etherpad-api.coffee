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

  mergeTokens: (iterTokens, modeTokens) ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?
    text = iterTokens.text
    parserPool = new AttributePool();
    parserAttributes = Changeset.builder(text.length);
    for attr in modeTokens
      parserAttributes.keep(attr.value.length, 0, [[attr.type, true]], parserPool);
    parserCS = parserAttributes.toString()

    docCS = Changeset.pack(text.length, text.length, iterTokens.attribs.replace(/\+/g,"="), "")
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
        value : stringIter.take(Math.min(op.chars, stringIter.remaining()));
    tokens

  cloneIterator: (iter) ->
    return {
      textPos : iter.textPos
      attribPos : iter.attribPos
      attribConsumed : iter.attribConsumed
    }

  consumeIterator: (iter, length) ->
    return {"attribs":"", "text":""} if length == 0

    text = @snapshot.text.substring(iter.textPos, iter.textPos+length);
    iter.textPos += length

    opIter = Changeset.opIterator(@snapshot.attribs, iter.attribPos);
    Changeset.assert(opIter.hasNext(), "iterator out of range");
    op = opIter.next();
    Changeset.assert(op.chars > iter.attribConsumed, "consumed <= available");
    op.chars -= iter.attribConsumed;
    assem = Changeset.smartOpAssembler();
    while (op.chars <= length)
      assem.append(op);
      iter.attribConsumed = 0;
      length -= op.chars
      iter.attribPos = opIter.lastIndex();

      if length == 0
        break;
      Changeset.assert(opIter.hasNext(), "iterator out of range");
      op = opIter.next();

    op.chars = length
    assem.append(op);
    iter.attribConsumed += length;
    return {"attribs": assem.toString(), "text" : text};

  createIterator: (startOffset) ->
    iter = { attribPos : 0, textPos : 0, attribConsumed : 0};
    consumeIterator iter, startOffset if startOffset > 0
    iter

  # add attributes [[key1, val1], [key2, val2], ...] to the range starting at offset and with length length
  setAttributes: (startOffset, length, attribs, callback) ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?
    op = 
      pool : new AttributePool()
    op.changeset = Changeset.builder(@getLength()).keep(startOffset).keep(length, 0, attribs, op.pool).toString();
    @emit 'refresh', startOffset, length
    @submitOp op, callback

  # getAttributes 
  getAttributes: (startOffset, length) ->
    @snapshot = etherpad.tryDeserializeSnapshot(@snapshot) if not @snapshot.pool.getAttrib?

  insert: (pos, text, callback) ->
    result = {};
    result.pool = new AttributePool();
    result.changeset = Changeset.builder(@snapshot.text.length).keep(pos).insert(text, "", result.pool).toString()
    @submitOp result, callback
    result
  
  del: (pos, length, callback) ->
    result = {};
    result.pool = new AttributePool()
    result.changeset = Changeset.builder(@snapshot.text.length).keep(pos).remove(length).toString()
    @submitOp result, callback
    result
  
  _register: ->
    @on 'remoteop', (op) ->
      unpacked = Changeset.unpack(op.changeset);
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