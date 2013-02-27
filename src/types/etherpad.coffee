# This is the type for etherpad changesets
# The snapshot has a JSON structure of
#  {
#    "text" - the text of the pad
#    "attribs" - attributes
#    "pool"  - the attribute pool
#  }

# The Changesets have the structure
#  {
#    "changeset" - serialized version of the changeset
#    "pool"  - the pool
#  }

if WEB?
  if window.ShareJS? && window.ShareJS.Changeset?
    Changeset = window.ShareJS.Changeset
    AttributePool = window.ShareJS.AttributePool
else
  Changeset = require("./../lib-etherpad/Changeset");
  AttributePool = require("./../lib-etherpad/AttributePool");

etherpad = 
  Changeset : Changeset
  AttributePool : AttributePool

etherpad.name = "etherpad"

etherpad.create = -> 
  console.log "ERROR: Etherpad library not found. Make sure to include Attributepool.js and Changeset.js in your javascript sourcecode" if not Changeset?
  "text"    : "",
  "attribs"  : Changeset.makeAttribution(""),
  "pool"    : new AttributePool()

etherpad.tryDeserializeSnapshot = (snapshot) ->
  return snapshot if snapshot.pool.clone # already deserialized
  snapshot.pool = new AttributePool().fromJsonable(snapshot.pool)
  snapshot;

etherpad.tryDeserializeOp = (op) ->
  return op if op.pool.clone
  if op.pool.numToAttrib
    op.pool = new AttributePool().fromJsonable(op.pool)
  else
    op.pool = new AttributePool().fromJsonable(JSON.parse(op.pool))
  op
  
etherpad.apply = (snapshot, op) ->
  snapshot = etherpad.tryDeserializeSnapshot(snapshot)
  op = etherpad.tryDeserializeOp(op)
  result = {}
  result.pool = snapshot.pool.clone();
  newCS = Changeset.moveOpsToNewPool(op.changeset, op.pool, result.pool);
  result.text = Changeset.applyToText(newCS, snapshot.text);
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
  text = snapshot.text
  attribs = snapshot.attribs
  pool = snapshot.pool.toJsonable()

etherpad.serializeOp = (snapshot) ->
  changeset = snapshot.changeset
  pool = JSON.stringify(snapshot.pool)

etherpad.deserialize = (obj) ->
  text = obj.text
  attribs = obj.attribs
  pool = new AttributePool().fromJsonable(obj.pool)

if WEB?
  exports.types ||= {}

  # [] is used to prevent closure from renaming types.text
  exports.types.etherpad = etherpad
else
  module.exports = etherpad
