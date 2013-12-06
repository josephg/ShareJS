if WEB? 
  if window.ShareJS? && window.ShareJS.Changeset?
    Changeset = window.ShareJS.Changeset
    AttributePool = window.ShareJS.AttributePool
else 
  etherpad = require './etherpad'
  AttributePool = require './../lib-etherpad/AttributePool.js'  
  Changeset = require './../lib-etherpad/Changeset.js'

attribsToTokens = (attribs, text, pool) ->
  iter = Changeset.opIterator(attribs);
  tokens = [];
  stringIter = Changeset.stringIterator(text);
  while (iter.hasNext())
    op = iter.next();
    str = [];
    op.attribs.replace(/\*([0-9a-z]+)/g, (_, a) ->
      pair = pool.getAttrib(Changeset.parseNum(a));
      str.push pair
    ) 
    tokens.push 
      type : str
      value : stringIter.take(Math.min(op.chars, stringIter.remaining()));
  tokens

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
    tokens = attribsToTokens(resultCS.ops, text, parserPool)
    for token in tokens
      res = "";
      for attr,i in token.type
        if i > 0
          res += " ace_"+attr[0]
        else
          res += attr[0];
      token.type = res
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

  createIterator: (startOffset = 0) ->
    iter = { attribPos : 0, textPos : 0, attribConsumed : 0};
    @consumeIterator iter, startOffset if startOffset > 0
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
    iter = @createIterator(startOffset);
    op = @consumeIterator(iter, length);
    attribsToTokens(op.attribs, op.text, @snapshot.pool)

  insert: (pos, text, callback) ->
    result = {};
    result.pool = new AttributePool();
    attribs = [{type:""}];
    attribs = @getAttributes(pos - 1, 1) if pos > 0

    result.changeset = Changeset.builder(@snapshot.text.length).keep(pos).insert(text, attribs[0].type, result.pool).toString()
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
      offset = 0; origSnapOffset = 0;
      refreshFirstOffset = 10000000;
      refreshLastOffset = -1;
      while iter.hasNext()
        o = iter.next()
        switch (o.opcode) 
          when '+'  
            @emit 'insert', offset, strIter.take(o.chars);
            offset = offset + o.chars
          when '-' 
            @emit 'delete', offset, @snapshot.text.substring(origSnapOffset, origSnapOffset+o.chars)
            origSnapOffset += o.chars;
          when '='
            if o.attribs.length > 0
              refreshFirstOffset = Math.min(offset, refreshFirstOffset);
              refreshLastOffset = Math.max(offset + o.chars, refreshLastOffset);
            offset = offset + o.chars
            origSnapOffset += o.chars
        if (refreshLastOffset > 0)
          @emit 'refresh', refreshFirstOffset, refreshLastOffset - refreshFirstOffset

exports.etherpad = etherpad