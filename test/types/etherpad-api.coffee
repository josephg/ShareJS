etherpad = require "../../src/types/etherpad.coffee"
etherpad = require "../../src/types/etherpad-api.coffee"
etherpad = etherpad.etherpad
Changeset = etherpad.Changeset
randomizer = require "../helpers/randomizer"
randomWord = require './randomWord'

assert = require 'assert'
MicroEvent = require '../../src/client/microevent'

Doc = (data) ->
  @snapshot = data ? etherpad.create()
  @type = etherpad
  @submitOp = (op) ->
    @snapshot = etherpad.apply @snapshot, op
    @emit 'change', op
  @_register()
Doc.prototype = etherpad.api
MicroEvent.mixin Doc

lines = ["test line1", "line2","","line4"];
text = lines.join("\n");

exports.test1 = (test) ->
	doc = new Doc
	test.ok(doc.getText()=="");
	test.ok(doc.getLength()==0);
	test.done();

exports.test2 = (test) ->
	doc = new Doc
	doc.insert(0, text);
	test.ok(text == doc.getText())
	test.ok(text.length == doc.getLength())
	test.done();

exports.test3 = (test) ->
	doc = new Doc
	doc.insert(0, text);
	c = doc.createIterator();
	for line,i in lines
		res = doc.consumeIterator(c, line.length);
		test.ok(res.text == line)
		doc.consumeIterator(c, 1) if i<lines.length-1;
	test.done();

exports.test4 = (test) ->
	doc = new Doc
	doc.insert(0, text);
	doc.setAttributes(0, 4, [["bold", true]]);
	attributes = doc.getAttributes(1, 5);
	test.ok(attributes.length == 2);
	test.ok(attributes[0].type.length == 1)
	test.ok(attributes[1].type.length == 0)
	test.done();

etherpad.generateRandomOp = (doc) ->
    docStr = doc.text
    pct = 0.9

    op = Changeset.builder(docStr.length);
    pos = 0;

    while Math.random() < pct
      pct /= 2
      
      t = Math.random();
      if  t > 0.66
        # Append an insert
        str = randomWord() + ' '
        op.insert(str)
        docStr = docStr[...pos] + str + docStr[pos..]
        pos += str.length
      else if t > 0.33
        # Append a delete
        length = Math.min(Math.floor(Math.random() * 4), docStr.length - pos)
        op.remove(length)
        docStr = docStr[...pos] + docStr[(pos + length)..]
      else
        length = Math.min(Math.floor(Math.random() * 4), docStr.length - pos)
        op.keep(length)
        pos += length

    resDoc =
      text : docStr
      attribs : Changeset.makeAttribution(docStr)
      pool : new AttributePool()
  #  p "generated op #{i op} -> #{i docStr}"
    docOp = 
      pool : new AttributePool();
      changeset : op.toString()
    [docOp, resDoc]

#exports.test5 = (test) ->
#	randomizer.test(etherpad);
