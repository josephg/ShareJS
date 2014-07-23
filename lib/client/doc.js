var types = require('./types').types;
var EventEmitter = require('events').EventEmitter;

// OT helpers.
var ot = require('./ot');

module.exports = Doc;

function Doc(connection, collection, name) {
  EventEmitter.call(this);
  this.connection = connection;

  // Collection name and docname. Both strings.
  this.collection = collection;
  this.name = name;

  // The actual document data.

  // The OT type of this document. This document object has data if the type is
  // not null.
  this.type = null;
  this.version = null;
  this.snapshot = null;

  // Do we want to be subscribed? Both when this is set and when we reconnect,
  // we'll send a subscribe message if needed.
  this.subscribed = false;

  // Based on the type, what APIs does this document provide? Currently the only
  // API available is 'text'.
  this.provides = {};

  // The editing contexts. These are usually instances of the type API when the
  // document is ready for edits.
  this.editingContexts = [];

  // The op that is currently roundtripping to the server, or null.
  //
  // When the connection reconnects, the inflight op is resubmitted.
  //
  // This has the same format as an entry in pendingData, which is:
  // {[create:{...}], [del:true], [op:...], callbacks:[...], src:, seq:}
  this.inflightData = null;

  // All ops that are waiting for the server to acknowledge @inflightData. This
  // used to just be a single operation, but creates & deletes can't be composed
  // with regular operations.
  //
  // This is a list of opData, where opdata has up to one of create:, del: or
  // op:, and a callbacks:[...] list.
  this.pendingData = [];

  // Pausing the document temporarily stops it from sending ops. (They get
  // buffered).
  this.paused = false;
}

// Can't use Doc.prototype = Object.create(...) because its not supported in
// IE9.
(function() {
  for (var k in EventEmitter.prototype) {
    Doc.prototype[k] = EventEmitter.prototype[k];
  }
})();

/**
 * Unsubscribe and remove all editing contexts
 */
Doc.prototype.destroy = function() {
  var doc = this;
  this.unsubscribe();

  doc.connection._destroyDoc(doc);
  doc.removeContexts();
};

Doc.prototype.subscribe = function() {
  if (this.subscribed) return;

  this.subscribed = true;
  this.connection._subscribeDoc(this);
};

Doc.prototype.unsubscribe = function() {
  if (!this.subscribed) return;

  this.subscribed = false;
  // There's no bulk unsubscribe message.
  this.connection.send({c:this.collection, d:this.name, a:'unsub'});
};

Doc.prototype.fetchOps = function() {
  throw Error('not implemented');
};

// ****** Manipulating the document snapshot, version and type.

Doc.prototype._removeType = function() {
  if (!this.type) return;
  this.removeContexts();
  this.type = null;
  this.provides = {};
  this.snapshot = undefined;
}

// Set the document's type, and associated properties. Most of the logic in
// this function exists to update the document based on any added & removed API
// methods.
//
// @param newType OT type provided by the ottypes library or its name or uri
Doc.prototype._setType = function(newType) {
  this._removeType();
  if (!newType) return;

  if (typeof newType === 'string') {
    if (!types[newType]) throw new Error("Missing type " + newType);
    newType = types[newType];
  }

  this.type = newType;

  // Register the new type's API.
  if (newType.api) this.provides = newType.api.provides;
};

// Injest snapshot data. This data must include a version, snapshot and type.
// This is used both to ingest data that was exported with a webpage and data
// that was received from the server during a fetch.
//
// data is an object with {v:version, data:snapshot, type:type} properties.

Doc.prototype.ingestData = function(data) {
  if (this.version != null) {
    console.warn('Ignoring attempt to ingest data when we already have some');
    return;
  }

  // version is the only field which can't be null.
  if (typeof data.v !== 'number')
    throw new Error('Missing version in ingested data');

  this._setType(data.type);
  this.version = data.v;
  this.snapshot = data.data;

  this.emit('ready');
};

// Get and return the current document snapshot.
Doc.prototype.getSnapshot = function() {
  return this.snapshot;
};

// The callback will be called at a time when the document has a snapshot and
// you can start applying operations. This may be immediately.
Doc.prototype.whenReady = function(fn) {
  if (this.version != null) {
    fn();
  } else {
    this.once('ready', fn);
  }
};

Doc.prototype.hasPendingData = function() {
  return this.inflightData != null || !!this.pendingData.length;
};


// **** Helpers for network messages

// // Send a message to the connection from this document.
// Doc.prototype._send = function(message) {
//   message.c = this.collection;
//   message.d = this.name;
//   this.connection.send(message);
// };

// This is called by the connection when it receives a message for the document.
Doc.prototype._onMessage = function(msg) {
  if (!(msg.c === this.collection && msg.d === this.name)) {
    // This should never happen - its a sanity check for bugs in the connection code.
    throw new Error("Got message for wrong document.");
  }

  if (msg.error) this.emit('error', msg.error, msg);

  // msg.a = the action.
  switch (msg.a) {
    case 'fetch':
      // We're done fetching. This message has no other information.
      if (msg.data) this.ingestData(msg.data);
      break;

    case 'sub':
      // Subscribe reply.
      if (msg.error) {
        this.emit('error', msg.error, msg);
        this.subscribed = false;
      } else {
        this.emit('subscribe');
        if (msg.data) this.ingestData(msg.data);
      }
      break;

    case 'unsub':
      this.emit('error', msg.error, msg);
      // Unsubscribe reply
      this.emit('unsubscribe');
      break;

    case 'ack':
      // Acknowledge a locally submitted operation.
      //
      // Usually we do nothing here - all the interesting logic happens when we
      // get sent our op back in the op stream (which happens even if we aren't
      // subscribed). However, if the op doesn't get accepted, we still need to
      // clear some state.
      //
      // If the message error is 'Op already submitted', that means we've
      // resent an op that the server already got. It will also be confirmed
      // normally.
      if (msg.error && msg.error !== 'Op already submitted') {
        this.emit('error', msg.error, msg);
        // The server has rejected an op from the client for some reason. We'll
        // send the error message to the user and try to roll back the change.
        if (this.inflightData) {
          console.warn('Operation was rejected (' + msg.error + '). Trying to rollback change locally.');
          this._tryRollback(this.inflightData);
        } else {
          // I managed to get into this state once. I'm not sure how it happened.
          // The op was maybe double-acknowledged?
          console.warn('Second acknowledgement message (error) received', msg, this);
        }

        this._clearInflightOp(msg.error);
      }
      break;

    case 'op':
      if (this.inflightData &&
          msg.src === this.inflightData.src &&
          msg.seq === this.inflightData.seq) {
        // This one is mine. Accept it as acknowledged.
        this._opAcknowledged(msg);
        break;
      }

      if (msg.v < this.version) {
        // This will happen naturally in the following (or similar) cases:
        //
        // Client is not subscribed to document.
        // -> client submits an operation (v=10)
        // -> client subscribes to a query which matches this document. Says we
        //    have v=10 of the doc.
        //
        // <- server acknowledges the operation (v=11). Server acknowledges the
        //    operation because the doc isn't subscribed
        // <- server processes the query, which says the client only has v=10.
        //    Server subscribes at v=10 not v=11, so we get another copy of the
        //    v=10 operation.
        //
        // In this case, we can safely ignore the old (duplicate) operation.
        break;
      }
      
      if (msg.v > this.version) {
        // If we get in here, it means we missed an operation from the server,
        // or operations are being sent to the client out of order. This
        // should never happen - but if it does, we can recover easily.
        console.warn("Client got future operation from the server",
            this.collection, this.name, msg);
        this.fetchOps();
        break;
      }

      if (this.inflightData) ot.xf(this.inflightData, msg);

      for (var i = 0; i < this.pendingData.length; i++) {
        ot.xf(this.pendingData[i], msg);
      }

      this.version++;
      this._otApply(msg, false);
      break;

    case 'meta':
      if (console) console.warn('Unhandled meta op:', msg);
      break;

    default:
      if (console) console.warn('Unhandled document message:', msg);
      break;
  }
};


// Send the next pending op to the server, if we can.
//
// Only one operation can be in-flight at a time. If an operation is already on
// its way, or we're not currently connected, this method does nothing.
Doc.prototype.flush = function() {
  if (!this.connection.canSend || this.inflightData) return;

  var opData;
  // Pump and dump any no-ops from the front of the pending op list.
  while (this.pendingData.length && ot.isNoOp(opData = this.pendingData[0])) {
    var callbacks = opData.callbacks;
    for (var i = 0; i < callbacks.length; i++) {
      callbacks[i](opData.error);
    }
    this.pendingData.shift();
  }

  // We consider sending operations before considering subscribing because its
  // convenient in access control code to not need to worry about subscribing
  // to documents that don't exist.
  if (!this.paused && this.pendingData.length && this.connection.state === 'connected') {
    // Try and send any pending ops. We can't send ops while in 
    this.inflightData = this.pendingData.shift();
    this.inflightData.collection = this.collection;
    this.inflightData.name = this.name;
    this.connection.sendOp(this.inflightData);
  }
};


// *** Operations

/**
 * Applies the operation to the snapshot
 *
 * If the operation is create or delete it emits `create` or `del`.  Then the
 * operation is applied to the snapshot and `op` and `after op` are emitted.  If
 * the type supports incremental updates and `this.incremental` is true we fire
 * `op` after every small operation.
 *
 * This is the only function to fire the above mentioned events.
 *
 * @private
 */
Doc.prototype._otApply = function(opData, context) {
  if (opData.create) {
    // If the type is currently set, it means we tried creating the document
    // and someone else won. client create x server create = server create.
    var create = opData.create;
    this._setType(create.type);
    this.snapshot = this.type.create(create.data);

    this.locked = false;
    this.emit('create', context);
  } else if (opData.del) {
    // The type should always exist in this case. del x _ = del
    var oldSnapshot = this.snapshot;
    this._removeType();

    this.locked = false;
    this.emit('del', context, oldSnapshot);
  } else if (opData.op) {
    if (!this.type) throw new Error('Document does not exist');

    var type = this.type;
    var op = opData.op;
    
    // The context needs to be told we're about to edit, just in case it needs
    // to store any extra data. (text-tp2 has this constraint.)
    for (var i = 0; i < this.editingContexts.length; i++) {
      var c = this.editingContexts[i];
      if (c != context && c._beforeOp) c._beforeOp(opData.op);
    }

    this.emit('before op', op, context);

    // This exists so clients can pull any necessary data out of the snapshot
    // before it gets changed.  Previously we kept the old snapshot object and
    // passed it to the op event handler. However, apply no longer guarantees
    // the old object is still valid.
    //
    // Because this could be totally unnecessary work, its behind a flag. set
    // doc.incremental to enable.
    if (this.incremental && type.incrementalApply) {
      var _this = this;
      this.locked = true;
      type.incrementalApply(this.snapshot, op, function(o, snapshot) {
        _this.snapshot = snapshot;
        _this.emit('op', o, context);
      });
      this.locked = false;
    } else {
      // This is the most common case, simply applying the operation to the
      // local snapshot.
      this.snapshot = type.apply(this.snapshot, op);
      this.emit('op', op, context);
    }

    var contexts = this.editingContexts;
    // Notify all the contexts about the op (well, all the contexts except
    // the one which initiated the submit in the first place).
    // NOTE Handle this with events?
    for (var i = 0; i < contexts.length; i++) {
      var c = contexts[i];
      if (c != context && c._onOp) c._onOp(opData.op);
    }
    for (var i = 0; i < contexts.length; i++) {
      if (contexts.remove) contexts.splice(i--, 1);
    }

    return this.emit('after op', opData.op, context);
  }

  // Its possible for none of the above cases to match, in which case the op
  // is a no-op. This will happen when a document has been deleted locally and
  // remote ops edit the document.
};

// Queues the operation for submission to the server and applies it locally.
//
// Internal method called to do the actual work for submitOp(), create() and del().
// @private
Doc.prototype._submitOpData = function(opData, context, callback) {
  //console.log('submit', JSON.stringify(opData), 'v=', this.version);

  if (typeof context === 'function') {
    callback = context;
    context = true; // The default context is <true>.
  } else if (context == null) {
    context = true;
  }

  var error = function(err) {
    if (callback) callback(err, opData);
    else console.warn('Failed attempt to submitOp:', err);
  };

  if (this.locked) {
    console.warn('Invalid call to submitOp for', opData);
    return error("Cannot call submitOp from inside an 'op' event handler");
  }

  // The opData contains either op, create, delete, or none of the above (a no-op).
  if (opData.op) {
    if (!this.type) return error('Document has not been created');
    // Try to normalize the op. This removes trailing skip:0's and things like that.
    if (this.type.normalize) opData.op = this.type.normalize(opData.op);
  }

  opData.type = this.type;
  opData.callbacks = [];

  // If the type supports composes, try to compose the operation onto the end
  // of the last pending operation.
  var operation;
  var previous = this.pendingData[this.pendingData.length - 1];

  if (previous && ot.tryCompose(this.type, previous, opData)) {
    operation = previous;
  } else {
    operation = opData;
    this.pendingData.push(opData);
  }
  if (callback) operation.callbacks.push(callback);

  this._otApply(opData, context);

  // The call to flush is in a timeout so if submitOp() is called multiple
  // times in a closure all the ops are combined before being sent to the
  // server. It doesn't matter if flush is called a bunch of times.
  var _this = this;
  setTimeout((function() { _this.flush(); }), 0);
};

// *** Client OT entrypoints.

// Submit an operation to the document.
//
// @param operation handled by the OT type
// @param [context] editing context
// @param [callback] called after operation submitted
//
// @fires before op, op, after op
Doc.prototype.submitOp = function(op, context, callback) {
  this._submitOpData({op: op}, context, callback);
};

// Create the document, which in ShareJS semantics means to set its type. Every
// object implicitly exists in the database but has no data and no type. Create
// sets the type of the object and can optionally set some initial data on the
// object, depending on the type.
//
// @param type  OT type
// @param data  initial
// @param context  editing context
// @param callback  called when operation submitted
Doc.prototype.create = function(type, data, context, callback) {
  if (typeof data === 'function') {
    // Setting the context to be the callback function in this case so _submitOpData
    // can handle the default value thing.
    context = data;
    data = undefined;
  }
  if (this.type) {
    if (callback) callback('Document already exists');
    return 
  }

  this._submitOpData({create: {type:type, data:data}}, context, callback);
};

// Delete the document. This creates and submits a delete operation to the
// server. Deleting resets the object's type to null and deletes its data. The
// document still exists, and still has the version it used to have before you
// deleted it (well, old version +1).
//
// @param context   editing context
// @param callback  called when operation submitted
Doc.prototype.del = function(context, callback) {
  if (!this.type) {
    if (callback) callback('Document does not exist');
    return;
  }

  this._submitOpData({del: true}, context, callback);
};

// Stops the document from sending any operations to the server.
Doc.prototype.pause = function() {
  this.paused = true;
};

// Continue sending operations to the server
Doc.prototype.resume = function() {
  this.paused = false;
  this.flush();
};



// *** Receiving operations

// This will be called when the server rejects our operations for some reason.
// There's not much we can do here if the OT type is noninvertable, but that
// shouldn't happen too much in real life because readonly documents should be
// flagged as such. (I should probably figure out a flag for that).
//
// This does NOT get called if our op fails to reach the server for some reason
// - we optimistically assume it'll make it there eventually.
Doc.prototype._tryRollback = function(opData) {
  // This is probably horribly broken.
  if (opData.create) {
    this._removeType();
  } else if (opData.op && opData.type.invert) {
    opData.op = opData.type.invert(opData.op);

    // Transform the undo operation by any pending ops.
    for (var i = 0; i < this.pendingData.length; i++) {
      xf(this.pendingData[i], opData);
    }

    // ... and apply it locally, reverting the changes.
    // 
    // This operation is applied to look like it comes from a remote context.
    // I'm still not 100% sure about this functionality, because its really a
    // local op. Basically, the problem is that if the client's op is rejected
    // by the server, the editor window should update to reflect the undo.
    this._otApply(opData, false);
  } else if (opData.op || opData.del) {
    // This is where an undo stack would come in handy.
    this._removeType();
    this.version = null;
    this.subscribed = false;
    this.emit('error', "Op apply failed and the operation could not be reverted");

    // Trigger a fetch. In our invalid state, we can't really do anything.
    this.fetch();
  }
};

Doc.prototype._clearInflightOp = function(error) {
  var callbacks = this.inflightData.callbacks;
  for (var i = 0; i < callbacks.length; i++) {
    callbacks[i](error || this.inflightData.error);
  }

  this.inflightData = null;

  if (!this.pendingData.length) {
    // This isn't a very good name.
    this.emit('nothing pending');
  }
};

// This is called when the server acknowledges an operation from the client.
Doc.prototype._opAcknowledged = function(msg) {
  // Our inflight op has been acknowledged, so we can throw away the inflight data.
  // (We were only holding on to it incase we needed to resend the op.)
  if (this.v != null) {
    if (!this.inflightData.create) throw new Error('Cannot acknowledge an op.');

    // Our create has been acknowledged. This is the same as ingesting some data.
    this.version = msg.v;
    var _this = this;
    setTimeout(function() { _this.emit('ready'); }, 0);
  } else {
    // We already have a snapshot. The snapshot should be at the acknowledged
    // version, because the server has sent us all the ops that have happened
    // before acknowledging our op.

    // This should never happen - something is out of order.
    if (msg.v !== this.version) {
      console.warn('In _opAcknowledged', msg, this.inflightData);
      throw new Error('Invalid version from server. This can happen when you submit ops in a submitOp callback.');
    }
  }
  
  // The op was committed successfully. Increment the version number
  this.version++;

  this._clearInflightOp();
};

// Creates an editing context
//
// The context is an object responding to getSnapshot(), submitOp() and
// destroy(). It also has all the methods from the OT type mixed in.
// If the document is destroyed, the detach() method is called on the context.
Doc.prototype.createContext = function() {
  var type = this.type;
  if (!type) throw new Error('Missing type');

  // I could use the prototype chain to do this instead, but Object.create
  // isn't defined on old browsers. This will be fine.
  var doc = this;
  var getSnapshot = function() {
    return doc.snapshot;
  };
  var submitOp = function(op, callback) {
    doc.submitOp(op, context, callback);
  };

  var context = type.api ? type.api(getSnapshot, submitOp) : {};

  context.provides = type.api ? type.api.provides : {};
  context.getSnapshot = getSnapshot;
  context.submitOp = submitOp;
  context.destroy = function() {
    if (this.detach) {
      this.detach();
      // Don't double-detach.
      delete this.detach;
    }
    // It will be removed from the actual editingContexts list next time
    // we receive an op on the document (and the list is iterated through).
    //
    // This is potentially dodgy, allowing a memory leak if you create &
    // destroy a whole bunch of contexts without receiving or sending any ops
    // to the document.
    //
    // NOTE Why can't we destroy contexts immediately?
    delete this._onOp;
    this.remove = true;
  };

  // This is dangerous, but really really useful for debugging. I hope people
  // don't depend on it.
  context._doc = this;

  this.editingContexts.push(context);

  return context;
};

/**
 * Destroy all editing contexts
 */
Doc.prototype.removeContexts = function() {
  for (var i = 0; i < this.editingContexts.length; i++) {
    this.editingContexts[i].destroy();
  }
  this.editingContexts.length = 0;
};
