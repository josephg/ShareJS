# Text document API for text
# :tabSize=4:indentSize=4:

if WEB? 
	Changeset = window.ShareJS.Changeset
	AttributePool = window.ShareJS.AttributePool
else 
	etherpad = require './etherpad'
	AttributePool = require './AttributePool'  
	Changeset = require './Changeset'
	
etherpad.api =
	provides: {text:true}

	# The number of characters in the string
	getLength: -> @snapshot.text.length

	# Get the text contents of a document
	getText: -> @snapshot.text

	getInteraction: (state) ->
		state.forward = true
		this.connection.send({
			doc: this.name,
			meta: state
		});
	
	# Get metadata starting from offset startOffset and having length length
	getMeta: (startOffset, length) ->
		if (typeof @snapshot.pool.getAttrib == "undefined")
			@snapshot = etherpad.tryDeserializeSnapshot(@snapshot);
		snapshot = @snapshot;
		iter = Changeset.opIterator(snapshot.attribs)
		offset = 0;
		result = [];
		rangeStart = Changeset.numToString(@snapshot.pool.putAttrib(["range.start",1], true));
		rangeEnd = Changeset.numToString(@snapshot.pool.putAttrib(["range.end",1], true));
		rangeProps = [];
		inRange = false;
		clearRange = false
		while iter.hasNext()
			o = iter.next()
			if (o.opcode=='-')
				continue;
			if (clearRange)
				rangeProps = "";
				inRange = true;
				clearRange = false;
			# range is started 
			if (o.attribs.match("\\*"+rangeStart))
				rangeProps = o.attribs;
				inRange = true;
			# range finishes but needs to take effect starting from next token
			if (o.attribs.match("\\*"+rangeEnd))
				clearRange = true;
			
			if (offset + o.chars < startOffset)
				offset = offset + o.chars;
				continue;
			if (offset > startOffset + length)
				break;

			if (inRange)
				att = rangeProps;
				valList = [];
				att.replace(/\*([0-9a-zA-Z]+)/g, (match...) ->
					attid = Changeset.parseNum(match[1]);
					att = snapshot.pool.getAttrib(attid);
					valList.push({
						key:att[0],
						value:att[1]
						});
					)
				if (valList.length>0) 
					result.push({
					start: Math.max(startOffset, offset), 
					end: Math.min(startOffset+length, offset + o.chars),
					attributes: valList,
					})
			offset = offset + o.chars
		return result
      
	insert: (pos, text, callback) ->
		result = {};
		result.pool = new AttributePool();
		result.changeset = Changeset.builder(@snapshot.text.length)
							.keep(pos,0).insert(text, "", result.pool).toString()
		@submitOp result, callback
		result
  
	del: (pos, length, callback) ->
		result = {};
		result.pool = new AttributePool()
		result.changeset = Changeset.builder(@snapshot.text.length).keep(pos,0).remove(length,0).toString()
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
				#if (refreshLastOffset > 0)
				#	@emit 'refresh', refreshFirstOffset, refreshLastOffset - refreshFirstOffset
