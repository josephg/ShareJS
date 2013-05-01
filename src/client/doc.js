var types, MicroEvent;

if (typeof require !== "undefined") {
  types = require('ot-types');
  MicroEvent = require('./microevent');
} else {
  types = window.ottypes;
}

/*
 * A Doc is a client's view on a sharejs document.
 *
 * Documents should not be created directly. Create them by calling the
 * document getting functions in connection.
 *
 * Documents are event emitters. Use doc.on(eventname, fn) to subscribe.
 *
 * Documents currently get mixed in with their type's API methods. So, you can
 * .insert('foo', 0) into a text document and stuff like that.
 *
 * Events:
 * - before op (op, localSite): Fired before an operation is applied to the
 *   document.
 * - op (op, localSite): Fired right after an operation (or part of an
 *   operation) has been applied to the document. Submitting another op here is
 *   invalid - wait until 'after op' if you want to submit more operations.  -
 *   changed (op)
 * - after op (op, localSite): Fired after an operation has been applied. You
 *   can submit more ops here.
 * - subscribed (error): The document was subscribed
 * - unsubscribed (error): The document was unsubscribed
 * - created: The document was created. That means its type was set and it has
 *   some initial data.
 * - error
 */
var Doc = exports.Doc = function(connection, collection, name, data) {
  this.connection = connection;

  this.collection = collection;
  this.name = name;

  // Do we automatically connect when our connection to the server
  // is restarted?
  this.autoSubscribe = false;

  // Are we ready for submitOp() calls? This means we know the snapshot at the
  // server at some version. If this.ready is true, this.version must be set
  // to a version and this.snapshot cannot be undefined.
  this.ready = false;

  // This doesn't provide any standard API access right now.
  this.provides = {};

  // The op that is currently roundtripping to the server, or null.
  //
  // When the connection reconnects, the inflight op is resubmitted.
  //
  // This has the same format as an entry in pendingData, which is:
  // {[create:{...}], [del:true], [op:...], callbacks:[...], src:, seq:}
  this.inflightData = null;

  // The editing contexts. These are usually instances of the type API when the
  // document is ready for edits.
  this.editingContexts = [];
  
  // All ops that are waiting for the server to acknowledge @inflightData
  // This used to just be a single operation, but creates & deletes can't be composed with
  // regular operations.
  //
  // This is a list of {[create:{...}], [del:true], [op:...], callbacks:[...]}
  this.pendingData = [];

  if (data && data.snapshot !== undefined) {
    this._injestData(data);
  }
};

// The callback will be called at a time when the document has a snapshot and
// you can start applying operations. This may be immediately.
Doc.prototype.whenReady = function(fn) {
  if (this.ready) {
    fn();
  } else {
    this.on('ready', fn);
  }
};

// Send a message to the connection from this document. Do not call this
// directly.
Doc.prototype._send = function(message) {
  message.c = this.collection;
  message.doc = this.name;
  this.connection.send(message);
};

// Open the document. There is no callback and no error handling if you're
// already connected.
//
// Only call this once per document.
Doc.prototype.subscribe = function() {
  this.autoSubscribe = true;
  if (this.connection.canSend)
    this._send(this.ready ? {a:'sub', v:this.version} : {a:'sub'});
};

Doc.prototype.unsubscribe = function() {
  this.autoSubscribe = false;
  if (this.connection.canSend)
    this._send({a:'unsub'});
};

// Call to request fresh data from the server.
Doc.prototype.fetch = function() {
  this._send({a: 'fetch'});
};

// Called whenever (you guessed it!) the connection state changes. This will
// happen when we get disconnected & reconnect.
Doc.prototype._onConnectionStateChanged = function(state, reason) {
  if (state === 'connecting') {
    if (this.autoSubscribe) {
      this.subscribe();
    }
    if (this.inflightData) {
      this._sendOpData(this.inflightData);
    }
  }
};

// This creates and returns an editing context using the current OT type.
Doc.prototype.createContext = function() {
  var type = this.type;
  if (!type) throw new Error('Missing type');

  // I could use the prototype chain to do this instead, but Object.create
  // isn't defined on old browsers. This will be fine.
  var doc = this;
  var context = {
    getSnapshot: function() {
      return doc.snapshot;
    },
    submitOp: function(op, callback) {
      doc.submitOp(op, context, callback);
    },
    destroy: function() {
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
      delete this._onOp;
      this.remove = true;
    },
  };

  if (type.api) {
    // Copy everything else from the type's API into the editing context.
    for (k in type.api) {
      context[k] = type.api[k];
    }
  } else {
    context.provides = {};
  }

  this.editingContexts.push(context);

  return context;
};

Doc.prototype.removeContexts = function() {
  if (this.editingContexts) {
    for (var i = 0; i < this.editingContexts.length; i++) {
      this.editingContexts[i].destroy();
    }
  }
  this.editingContexts.length = 0;
};

// Set the document's type, and associated properties. Most of the logic in
// this function exists to update the document based on any added & removed API
// methods.
Doc.prototype._setType = function(newType) {
  if (typeof newType === 'string') {
    if (!types[newType]) throw new Error("Missing type " + newType);
    newType = types[newType];
  }
  this.removeContexts();

  // Set the new type
  this.type = newType;

  // If we removed the type from the object, also remove its snapshot.
  if (!newType) {
    delete this.snapshot;
    this.provides = {};
  } else if (newType.api) {
    // Register the new type's API.
    this.provides = newType.api.provides;
  }
};

// Injest snapshot data. This data must include a version, snapshot and type.
// This is used both to injest data that was exported with a webpage and data
// that was received from the server during a fetch.
Doc.prototype._injestData = function(data) {
  if (typeof data.v !== 'number') throw new Error('Missing version in injested data');
  if (typeof this.version === 'number') {
    if (typeof console !== "undefined") console.warn('Ignoring extra attempt to injest data');
    return;
  }

  this.version = data.v;
  this.snapshot = data.snapshot;
  this._setType(data.type);

  this.ready = true;
  this.emit('ready');
};



// ************ Dealing with operations.

// Helper function to set opData to contain a no-op.
var setNoOp = function(opData) {
  delete opData.op;
  delete opData.create;
  delete opData.del;
};

// Transform server op data by a client op, and vice versa. Ops are edited in place.
Doc.prototype._xf = function(client, server) {
  // In this case, we're in for some fun. There are some local operations
  // which are totally invalid - either the client continued editing a
  // document that someone else deleted or a document was created both on the
  // client and on the server. In either case, the local document is way
  // invalid and the client's ops are useless.
  //
  // The client becomes a no-op, and we keep the server op entirely.
  if (server.create || server.del) return setNoOp(client);

  // The client has deleted the document while the server edited it. Kill the
  // server's op.
  if (client.del) return setNoOp(server);

  // It should be impossible to create a document when it currently already
  // exists.
  if (client.create)
    throw new Error('Invalid state. This is a bug. Please file an issue on github');

  // We only get here if either the server or client ops are no-op. Carry on,
  // nothing to see here.
  if (!server.op || !client.op) return;

  // They both edited the document. This is the normal case for this function -
  // as in, most of the time we'll end up down here.
  //
  // You should be wondering why I'm using client.type instead of this.type.
  // The reason is, if we get ops at an old version of the document, this.type
  // might be undefined or a totally different type. By pinning the type to the
  // op data, we make sure the right type has its transform function called.
  if (client.type.transformX) {
    var result = client.type.transformX(client.op, server.op);
    client.op = result[0];
    server.op = result[1];
  } else {
    client.op = client.type.transform(client.op, server.op, 'left');
    server.op = client.type.transform(server.op, client.op, 'right');
  }
};

// Internal method to actually apply the given op data to our local model.
//
// _afterOtApply() should always be called synchronously afterwards.
Doc.prototype._otApply = function(opData, context) {
  // Lock the document. Nobody is allowed to call submitOp() until _afterOtApply is called.
  this.locked = true;

  if (opData.create) {
    // If the type is currently set, it means we tried creating the document
    // and someone else won. client create x server create = server create.
    var create = opData.create;
    this._setType(create.type);
    this.snapshot = this.type.create(create.data);

    // This is a bit heavyweight, but I want the created event to fire outside of the lock.
    this.once('unlocked', function() {
      this.emit('created', context);
    });
  } else if (opData.del) {
    // The type should always exist in this case. del x _ = del
    this._setType(null);
    this.once('unlocked', function() {
      this.emit('deleted', context);
    });
  } else if (opData.op) {
    if (!this.type) throw new Error('Document does not exist');

    var type = this.type;

    var op = opData.op;
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
      type.incrementalApply(this.snapshot, op, function(o, snapshot) {
        _this.snapshot = snapshot;
        _this.emit('op', o, context);
      });
    } else {
      // This is the most common case, simply applying the operation to the local snapshot.
      this.snapshot = type.apply(this.snapshot, op);
      this.emit('op', op, context);
    }
  }
  // Its possible for none of the above cases to match, in which case the op is
  // a no-op. This will happen when a document has been deleted locally and
  // remote ops edit the document.
};

// This should be called right after _otApply.
Doc.prototype._afterOtApply = function(opData, context) {
  this.locked = false;
  this.emit('unlocked');
  if (opData.op) {
    var contexts = this.editingContexts;
    if (contexts) {
      // Notify all the contexts about the op (well, all the contexts except
      // the one which initiated the submit in the first place).
      for (var i = 0; i < contexts.length; i++) {
        var c = contexts[i];
        if (context != c && c._onOp) c._onOp(opData.op);
      }
      for (var i = 0; i < contexts.length; i++) {
        if (contexts.remove) contexts.splice(i--, 1);
      }
    }

    return this.emit('after op', opData.op, context);
  }
};

// Internal method to actually send op data to the server.
Doc.prototype._sendOpData = function(d) {
  var msg = {a: 'op', v: this.version};
  if (d.src) {
    msg.src = d.src;
    msg.seq = d.seq;
  }

  if (d.op) msg.op = d.op;
  if (d.create) msg.create = d.create;
  if (d.del) msg.del = d.del;

  this._send(msg);
  
  // The first time we send an op, its id and sequence number is implicit.
  if (!d.src) {
    d.src = this.connection.id;
    d.seq = this.connection.seq++;
  }
};

// Internal method called to do the actual work for submitOp(), create() and del(), below.
//
// context is optional.
Doc.prototype._submitOpData = function(opData, context, callback) {
  if (typeof context === 'function') {
    callback = context;
    context = true; // The default context is true.
  }
  if (context == null) context = true;

  var error = function(err) {
    if (callback) callback(err);
    else if (console) console.warn('Failed attempt to submitOp:', err);
  };

  if (!this.ready) {
    return error('You cannot currently submit operations to an unsubscribed document');
  }
  if (this.locked) {
    return error("Cannot call submitOp from inside an 'op' event handler");
  }

  // The opData contains either op, create, delete, or none of the above (a no-op).

  if (opData.op) {
    if (!this.type) return error('Document has not been created');

    // Try to normalize the op. This removes trailing skip:0's and things like that.
    if (this.type.normalize) opData.op = this.type.normalize(opData.op);
  }

  // Actually apply the operation locally.
  this._otApply(opData, context);

  // If the type supports composes, try to compose the operation onto the end
  // of the last pending operation.
  var entry;
  if (opData.op &&
      this.pendingData.length &&
      (entry = this.pendingData[this.pendingData.length - 1]).op &&
      this.type.compose) {
    entry.op = this.type.compose(entry.op, opData.op);
  } else {
    entry = opData;
    opData.type = this.type;
    opData.callbacks = [];
    this.pendingData.push(opData);
  }

  if (callback) entry.callbacks.push(callback);

  this._afterOtApply(opData, context);

  var _this = this;
  setTimeout((function() { _this.flush(); }), 0);
};

// Submit an operation to the document. The op must be valid given the current OT type.
Doc.prototype.submitOp = function(op, context, callback) {
  this._submitOpData({op: op}, context, callback);
};

// Create the document, which in ShareJS semantics means to set its type. Every
// object implicitly exists in the database but has no data and no type. Create
// sets the type of the object and can optionally set some initial data on the
// object, depending on the type.
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
Doc.prototype.del = function(context, callback) {
  if (!this.type) {
    if (callback) callback('Document does not exist');
    return;
  }

  this._submitOpData({del: true}, context, callback);
};


// This will be called when the server rejects our operations for some reason.
// There's not much we can do here if the OT type is noninvertable, but that
// shouldn't happen too much in real life because readonly documents should be
// flagged as such. (I should probably figure out a flag for that).
//
// This does NOT get called if our op fails to reach the server for some reason
// - we optimistically assume it'll make it there eventually.
Doc.prototype._tryRollback = function(opData) {
  if (opData.create) {
    return this._setType(null);
  } else if (opData.op && opData.type.invert) {
    var undo = opData.type.invert(opData.op);

    // Transform the undo operation by any pending ops.
    for (var i = 0; i < this.pendingData.length; i++) {
      this._xf(this.pendingData[i], undo);
    }

    // ... and apply it locally, reverting the changes.
    // 
    // This operation is applied to look like it comes from a remote context.
    // I'm still not 100% sure about this functionality, because its really a
    // local op. Basically, the problem is that if the client's op is rejected
    // by the server, the editor window should update to reflect the undo.
    this._otApply(undo, false);
    this._afterOtApply(undo, false);
  } else {
    // This is where an undo stack would come in handy.
    this._setType(null);
    this.v = null;
    this.ready = false;
    this.emit('error', "Op apply failed and the operation could not be reverted");

    // Trigger a fetch. In our invalid state, we can't really do anything.
    this.fetch();
  }
};

// This is called when the server acknowledges an operation from the client.
Doc.prototype._opAcknowledged = function(msg) {
  // We've tried to resend an op to the server, which has already been received
  // successfully. Do nothing. The op will be confirmed normally when the op
  // itself is echoed back from the server (handled below).
  if (msg.error === 'Op already submitted') {
    return;
  }

  // Our inflight op has been acknowledged, so we can throw away the inflight data.
  // (We were only holding on to it incase we needed to resend the op.)
  var acknowledgedData = this.inflightData;
  this.inflightData = null;

  if (msg.error) {
    // The server has rejected an op from the client for some reason.
    // We'll send the error message to the user and try to roll back the change.
    this._tryRollback(acknowledgedData);
  } else {
    if (msg.v !== this.version) {
      // This should never happen - it means that we've received operations out of order.
      throw new Error('Invalid version from server. Please file an issue, this is a bug.');
    }
    
    // The op was committed successfully. Increment the version number
    this.version++;
    this.emit('acknowledged', acknowledgedData);
  }

  for (var i = 0; i < acknowledgedData.callbacks; i++) {
    acknowledgedData.callbacks[i](msg.error);
  }

  // Consider sending the next op.
  this.flush();
};


// ***** Message handling

// This is called by the connection when it receives a message for the document.
Doc.prototype._onMessage = function(msg) {
  if (!(msg.c === this.collection && msg.doc === this.name)) {
    // This should never happen - its a sanity check for bugs in the connection code.
    throw new Error("Got message for wrong document.");
  }

  // msg.a = the action.
  switch (msg.a) {
    case 'data':
      // This will happen when we request a fetch or a fetch & subscribe.
      //
      // _injestData will emit a 'ready' event, which is usually what you want to listen to.
      this._injestData(msg);
      this.emit('fetched', this.snapshot);
      break;

    case 'sub':
      // Subscribe reply.
      if (msg.error) {
        if (console) console.error("Could not open document: " + msg.error);
        this.emit('error', msg.error);
        this.autoSubscribe = false;
      } else {
        this.subscribed = true;
        this.flush();
      }
      this.emit('subscribed', msg.error);
      break;

    case 'unsub':
      // Unsubscribe reply
      this.subscribed = false;
      this.emit('unsubscribed');
      break;

    case 'ack':
      // Acknowledge a locally submitted operation.
      //
      // I'm not happy with the way this logic (and the logic in the op
      // handler, below) currently works. Its because the server doesn't
      // currently guarantee any particular ordering of op ack & oplog messages.
      if (msg.error) this._opAcknowledged(msg);
      break;

    case 'op':
      if (this.inflightData &&
          msg.src === this.inflightData.src &&
          msg.seq === this.inflightData.seq) {
        this._opAcknowledged(msg);
        break;
      }

      if (msg.v !== this.version) {
        this.emit('error', "Expected version " + this.version + " but got " + msg.v);
        break;
      }

      if (this.inflightData) this._xf(this.inflightData, msg);

      for (var i = 0; i < this.pendingData.length; i++) {
        this._xf(this.pendingData[i], msg);
      }

      this.version++;
      this._otApply(msg, false);
      this._afterOtApply(msg, false);
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
  if (!this.connection.canSend || this.inflightData || this.pendingData.length == 0) return;

  this.inflightData = this.pendingData.shift();
  this._sendOpData(this.inflightData);
};

// Get and return the current document snapshot.
Doc.prototype.getSnapshot = function() {
  return this.snapshot;
};

MicroEvent.mixin(Doc);

