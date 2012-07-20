# This is the type for etherpad changesets
# The snapshot has a JSON structure of
#	{
#		"text" - the text of the pad
#		"attribs" - attributes
#		"pool"	- the attribute pool
#	}

# The Changesets have the structure
#	{
#		"changeset" - serialized version of the changeset
#		"pool"	- the pool
#	}

if WEB?
  Changeset = window.ShareJS.Changeset
  AttributePool = window.ShareJS.AttributePool
else
  Changeset = require("./Changeset");
  AttributePool = require("./AttributePool");

etherpad = {}

etherpad.name = "etherpad"
etherpad.create = ->
	{ 
		"text"		: "",
		"attribs"	: Changeset.makeAttribution(""),
		"pool"		: new AttributePool()
	}

etherpad.tryDeserializeSnapshot = (snapshot) ->
	if (snapshot.pool.clone)
		return snapshot
	snapshot.pool = new AttributePool().fromJsonable(snapshot.pool)
	return snapshot;
		
etherpad.tryDeserializeOp = (op) ->
	if (op.pool.clone)
		return op;
	if (op.pool.numToAttrib)
		op.pool = new AttributePool().fromJsonable(op.pool)
	else
		op.pool = new AttributePool().fromJsonable(JSON.parse(op.pool))
	return op
	
etherpad.apply = (snapshot, op) ->
	snapshot = etherpad.tryDeserializeSnapshot(snapshot)
	op = etherpad.tryDeserializeOp(op)
	result = {}
	result.pool = snapshot.pool.clone();
			
	newCS = Changeset.moveOpsToNewPool(op.changeset, op.pool, result.pool);
	result.text = Changeset.applyToText(newCS, snapshot.text);
	console.log(newCS);
	result.attribs = Changeset.applyToAttribution(newCS, snapshot.attribs, result.pool);
	return result
	
etherpad.transform = (op1, op2, side) ->
	op1 = etherpad.tryDeserializeOp(op1)
	op2 = etherpad.tryDeserializeOp(op2)
	result = {}
	# join the operation pools into a new one
	newPool = op1.pool.clone();
	# newPool will hold the combined pool
	# op2cs will hold the rewritten op2 cs 
	op2cs = Changeset.moveOpsToNewPool(op2.changeset, op2.pool, newPool);
	result.changeset = Changeset.follow(op1.changeset, op2cs, side=="right", newPool);
	result.pool = newPool
	return result

etherpad.compose = (op1, op2) ->
	op1 = etherpad.tryDeserializeOp(op1)
	op2 = etherpad.tryDeserializeOp(op2)
	result = {}
	# join the operation pools into a new one
	newPool = op1.pool.clone();
	# newPool will hold the combined pool
	# op2cs will hold the rewritten op2 cs 
	op2cs = Changeset.moveOpsToNewPool(op2.changeset, op2.pool, newPool);
	result.changeset = Changeset.compose(op1.changeset, op2cs, newPool);
	result.pool = newPool
	return result

etherpad.serialize = (snapshot) ->
	result = {}
	result.text = snapshot.text
	result.attribs = snapshot.attribs
	result.pool = snapshot.pool.toJsonable()
	return result

etherpad.serializeOp = (snapshot) ->
	result = {}
	result.changeset = snapshot.changeset
	result.pool = JSON.stringify(snapshot.pool)
	return result

	
etherpad.deserialize = (obj) ->
	result = {}
	result.text = obj.text
	result.attribs = obj.attribs
	result.pool = new AttributePool().fromJsonable(obj.pool)
	return result

if WEB?
  exports.types ||= {}

  # [] is used to prevent closure from renaming types.text
  exports.types.etherpad = etherpad
else
  module.exports = etherpad

  # require('./helpers').bootstrapTransform(json, json.transformComponent, json.checkValidOp, json.append)

