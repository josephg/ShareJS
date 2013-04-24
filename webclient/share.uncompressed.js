(function(){
(function(){var e,r,t,n,o,s,i={exports:{}},a=i.exports;a.name="text",a.uri="http://sharejs.org/types/textv1",a.create=function(e){if(null!=e&&"string"!=typeof e)throw Error("Initial data must be a string");return e||""},e=function(e){var r,t,n,o;if(!Array.isArray(e))throw Error("Op must be an array of components");for(t=null,n=0,o=e.length;o>n;n++){switch(r=e[n],typeof r){case"object":if(!("number"==typeof r.d&&r.d>0))throw Error("Object components must be deletes of size > 0");break;case"string":if(!(r.length>0))throw Error("Inserts cannot be empty");break;case"number":if(!(r>0))throw Error("Skip components must be >0");if("number"==typeof t)throw Error("Adjacent skip components should be combined")}t=r}if("number"==typeof t)throw Error("Op has a trailing skip")},t=function(e){return function(r){return r&&0!==r.d?0===e.length?e.push(r):typeof r==typeof e[e.length-1]?"object"==typeof r?e[e.length-1].d+=r.d:e[e.length-1]+=r:e.push(r):void 0}},n=function(e){var r,t,n,o;return r=0,t=0,o=function(n,o){var s,i;return r===e.length?-1===n?null:n:(s=e[r],"number"==typeof s?-1===n||n>=s-t?(i=s-t,++r,t=0,i):(t+=n,n):"string"==typeof s?-1===n||"i"===o||n>=s.length-t?(i=s.slice(t),++r,t=0,i):(i=s.slice(t,t+n),t+=n,i):-1===n||"d"===o||n>=s.d-t?(i={d:s.d-t},++r,t=0,i):(t+=n,{d:n}))},n=function(){return e[r]},[o,n]},r=function(e){return"number"==typeof e?e:e.length||e.d},s=function(e){return e.length>0&&"number"==typeof e[e.length-1]&&e.pop(),e},a.normalize=function(e){var r,n,o,i,a;for(o=[],r=t(o),i=0,a=e.length;a>i;i++)n=e[i],r(n);return s(o)},a.apply=function(r,t){var n,o,s,i,a;if("string"!=typeof r)throw Error("Snapshot should be a string");for(e(t),s=0,o=[],i=0,a=t.length;a>i;i++)switch(n=t[i],typeof n){case"number":if(n>r.length)throw Error("The op is too long for this document");o.push(r.slice(0,n)),r=r.slice(n);break;case"string":o.push(n);break;case"object":r=r.slice(n.d)}return o.join("")+r},a.transform=function(o,i,a){var c,f,u,h,p,b,l,g,m,y,d;if("left"!==a&&"right"!==a)throw Error("side ("+a+") must be 'left' or 'right'");for(e(o),e(i),p=[],c=t(p),d=n(o),g=d[0],l=d[1],m=0,y=i.length;y>m;m++)switch(u=i[m],typeof u){case"number":for(h=u;h>0;)f=g(h,"i"),c(f),"string"!=typeof f&&(h-=r(f));break;case"string":"left"===a&&(b=l(),"string"==typeof b&&c(g(-1))),c(u.length);break;case"object":for(h=u.d;h>0;)switch(f=g(h,"i"),typeof f){case"number":h-=f;break;case"string":c(f);break;case"object":h-=f.d}}for(;u=g(-1);)c(u);return s(p)},a.compose=function(o,i){var a,c,f,u,h,p,b,l,g,m;for(e(o),e(i),h=[],a=t(h),m=n(o),p=m[0],b=m[1],l=0,g=i.length;g>l;l++)switch(f=i[l],typeof f){case"number":for(u=f;u>0;)c=p(u,"d"),a(c),"object"!=typeof c&&(u-=r(c));break;case"string":a(f);break;case"object":for(u=f.d;u>0;)switch(c=p(u,"d"),typeof c){case"number":a({d:c}),u-=c;break;case"string":u-=c.length;break;case"object":a(c)}}for(;f=p(-1);)a(f);return s(h)},o=function(e,r){var t,n,o,s;for(n=0,o=0,s=r.length;s>o&&(t=r[o],!(n>=e));o++)switch(typeof t){case"number":if(n+t>=e)return e;n+=t;break;case"string":n+=t.length,e+=t.length;break;case"object":e-=Math.min(t.d,e-n)}return e},a.transformCursor=function(e,r,t){var n,s,i,a;if(s=0,t){for(i=0,a=r.length;a>i;i++)switch(n=r[i],typeof n){case"number":s+=n;break;case"string":s+=n.length}return[s,s]}return[o(e[0],r),o(e[1],r)]};var c=window.ottypes=window.ottypes||{},f=i.exports;c[f.name]=f,f.uri&&(c[f.uri]=f)})();// Text document API for the 'text' type.

var _types = (typeof window === 'undefined') ?
  require('ot-types') : window.ottypes;

_types['http://sharejs.org/types/textv1'].api = {
  provides: {text: true},
  
  // Returns the number of characters in the string
  getLength: function() { return this.getSnapshot().length; },

  // Returns the text content of the document
  getText: function() { return this.getSnapshot(); },

  // Insert the specified text at the given position in the document
  insert: function(pos, text, callback) {
    return this.submitOp([pos, text], callback);
  },

  remove: function(pos, length, callback) {
    return this.submitOp([pos, {d:length}], callback);
  },

  // When you use this API, you should implement these two methods
  // in your editing context.
  //onInsert: function(pos, text) {},
  //onRemove: function(pos, removedLength) {},

  _onOp: function(op) {
    var pos = 0;
    var spos = 0;
    for (var i = 0; i < op.length; i++) {
      var component = op[i];
      switch (typeof component) {
        case 'number':
          pos += component;
          spos += component;
          break;
        case 'string':
          if (this.onInsert) this.onInsert(pos, component);
          pos += component.length;
          break;
        case 'object':
          if (this.onRemove) this.onRemove(pos, component.d);
          spos += component.d;
      }
    }
  }
};
// This file is included at the top of the compiled client JS.

// All the modules will just add stuff to exports, and it'll all get exported.
var exports = window.sharejs = {version: '0.7.0'};

// This is a simple rewrite of microevent.js. I've changed the
// function names to be consistent with node.js EventEmitter.
//
// microevent.js is copyright Jerome Etienne, and licensed under the MIT license:
// https://github.com/jeromeetienne/microevent.js

var MicroEvent = function() {};

MicroEvent.prototype.on = function(event, fn) {
  var events = this._events = this._events || {};
  (events[event] = events[event] || []).push(fn);
};

MicroEvent.prototype.removeListener = function(event, fn) {
  var events = this._events = this._events || {};
  var listeners = events[event] = events[event] || [];

  // Sadly, no IE8 support for indexOf.
  var i = 0;
  while (i < listeners.length) {
    if (listeners[i] === fn) {
      listeners[i] = undefined;
    }
    i++;
  }

  // Compact the list when no event handler is actually running.
  setTimeout(function() {
    events[event] = [];
    var fn;
    for (var i = 0; i < listeners.length; i++) {
      // Only add back event handlers which exist.
      if ((fn = listeners[i])) events[event].push(fn);
    }
  }, 0);
};

MicroEvent.prototype.emit = function(event) {
  var events = this._events;
  var args = Array.prototype.splice.call(arguments, 1);

  if (!events || !events[event]) {
    if (event == 'error') {
      if (console) {
        console.error.apply(console, args);
      }
    }
    return;
  }

  var listeners = events[event];
  for (i = 0; i < listeners.length; i++) {
    if (listeners[i]) {
      listeners[i].apply(this, args);
    }
  }
};

MicroEvent.prototype.once = function(event, fn) {
  var listener, _this = this;
  this.on(event, listener = function() {
    _this.removeListener(event, listener);
    fn.apply(_this, arguments);
  });
};

MicroEvent.mixin = function(obj) {
  var proto = obj.prototype || obj;
  proto.on = MicroEvent.prototype.on;
  proto.removeListener = MicroEvent.prototype.removeListener;
  proto.emit = MicroEvent.prototype.emit;
  proto.once = MicroEvent.prototype.once;
  return obj;
};

if (typeof window == "undefined") module.exports = MicroEvent;

var types, MicroEvent;

if (typeof window === "undefined") {
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
  this.autoConnect = false;

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
  this.autoConnect = true;
  if (this.connection.canSend)
    this._send(this.ready ? {a:'fetchsub', v:this.version} : {a:'sub'});
};

Doc.prototype.unsubscribed = function() {
  this.autoConnect = false;
  if (this.connection.canSend)
    this._send({a:'unsub'});
};

// Call to request fresh data from the server.
Doc.prototype.fetch = function() {
  this._send({a: 'fetch'});
};

// Called whenever (you guessed it!) the connection state changes. This will
// happen when we get disconnected & reconnect.
Doc.prototype._connectionStateChanged = function(state, reason) {
  if (state === 'connecting') {
    if (this.autoConnect) {
      this.subscribe();
    }
    if (this.inflightData) {
      this._sendOpData(this.inflightData);
    }
  }
};

// This creates and returns an editing context using the current OT type.
Doc.prototype.createEditingContext = function() {
  var type = this.type;
  if (!type || !type.api) throw new Error('Missing type API');

  // I could use the prototype chain to do this instead, but Object.create
  // isn't defined on old browsers. This will be fine.
  var _this = this;
  var context = {
    getSnapshot: function() {
      return _this.snapshot;
    },
    submitOp: function(op, callback) {
      _this.submitOp(op, context, callback);
    },
  };

  // Copy everything else from the type's API into the editing context.
  for (k in type.api) {
    context[k] = type.api[k];
  }

  this.editingContexts.push(context);

  return context;
};

// Set the document's type, and associated properties. Most of the logic in
// this function exists to update the document based on any added & removed API
// methods.
Doc.prototype._setType = function(newType) {
  if (typeof newType === 'string') {
    if (!types[newType]) throw new Error("Missing type " + newType);
    newType = types[newType];
  }

  // Set the new type
  this.type = newType;

  // If we removed the type from the object, also remove its snapshot.
  if (!newType) {
    delete this.snapshot;
    this.provides = {};
    delete this.editingContexts;
  } else if (newType.api) {
    // Register the new type's API.
    this.provides = newType.api.provides;
    this.editingContexts = [];
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
  var type = this.type

  if (opData.create) {
    // If the type is currently set, it means we tried creating the document
    // and someone else won. client create x server create = server create.
    var create = opData.create;
    this._setType(create.type);
    this.snapshot = type.create(create.data);

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
    if (!type) throw new Error('Document does not exist');

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
    if (this.editingContexts) {
      // Notify all the contexts about the op (well, all the contexts except
      // the one which initiated the submit in the first place).
      for (var i = 0; i < this.editingContexts.length; i++) {
        var c = this.editingContexts[i];
        if (context != c && c._onOp)
          c._onOp(opData.op);
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

  if (!this.subscribed) {
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
        this.autoConnect = false;
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

      for (var i = 0; i < this.pendingData; i++) {
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

// Generated by CoffeeScript 1.6.1
var Connection, Doc, MicroEvent, ottypes;

if (typeof window === 'undefined') {
  ottypes = require('ot-types');
  Doc = require('./doc').Doc;
}

Connection = (function() {

  Connection.prototype._error = function(e) {
    this.setState('stopped', e);
    return this.disconnect(e);
  };

  function Connection(socket) {
    var _this = this;
    this.socket = socket;
    this.collections = {};
    this.nextQueryId = 1;
    this.queries = {};
    this.state = 'disconnected';
    this.socket.onmessage = function(msg) {
      var collection, doc, docName;
      console.log('RECV', msg);
      switch (msg.a) {
        case 'init':
          if (msg.protocol !== 0) {
            throw new Error('Invalid protocol version');
          }
          if (typeof msg.id !== 'string') {
            throw new Error('Invalid client id');
          }
          _this.id = msg.id;
          return _this.setState('connected');
        case 'q':
          return _this.queries[msg.id].onmessage(msg);
        default:
          if (msg.doc !== void 0) {
            collection = _this.lastReceivedCollection = msg.c;
            docName = _this.lastReceivedDoc = msg.doc;
          } else {
            collection = msg.c = _this.lastReceivedCollection;
            docName = msg.doc = _this.lastReceivedDoc;
          }
          if ((doc = _this.get(collection, docName))) {
            return doc._onMessage(msg);
          } else {
            return typeof console !== "undefined" && console !== null ? console.error('Unhandled message', msg) : void 0;
          }
      }
    };
    this.connected = false;
    this.socket.onclose = function(reason) {
      _this.setState('disconnected', reason);
      if (reason === 'Closed' || reason === 'Stopped by server') {
        return _this.setState('stopped', _this.lastError || reason);
      }
    };
    this.socket.onerror = function(e) {
      return _this.emit('error', e);
    };
    this.socket.onopen = function() {
      return _this.setState('connecting');
    };
    this.reset();
  }

  Connection.prototype.reset = function() {
    this.id = this.lastError = this.lastReceivedDoc = this.lastSentDoc = null;
    return this.seq = 1;
  };

  Connection.prototype.setState = function(newState, data) {
    var c, collection, doc, docName, _ref, _results;
    if (this.state === newState) {
      return;
    }
    if ((newState === 'connecting' && this.state !== 'disconnected') || (newState === 'connected' && this.state !== 'connecting')) {
      throw new Error("Cannot transition directly from " + this.state + " to " + newState);
    }
    this.state = newState;
    this.canSend = newState === 'connecting' || newState === 'connected';
    if (newState === 'disconnected') {
      this.reset();
    }
    this.emit(newState, data);
    _ref = this.collections;
    _results = [];
    for (c in _ref) {
      collection = _ref[c];
      _results.push((function() {
        var _results1;
        _results1 = [];
        for (docName in collection) {
          doc = collection[docName];
          _results1.push(doc._connectionStateChanged(newState, data));
        }
        return _results1;
      })());
    }
    return _results;
  };

  Connection.prototype.send = function(data) {
    var collection, docName;
    console.log("SEND:", data);
    if (data.doc) {
      docName = data.doc;
      collection = data.c;
      if (collection === this.lastSentCollection && docName === this.lastSentDoc) {
        delete data.c;
        delete data.doc;
      } else {
        this.lastSentCollection = collection;
        this.lastSentDoc = docName;
      }
    }
    return this.socket.send(data);
  };

  Connection.prototype.disconnect = function() {
    return this.socket.close();
  };

  Connection.prototype.get = function(collection, name) {
    var _ref;
    return (_ref = this.collections[collection]) != null ? _ref[name] : void 0;
  };

  Connection.prototype.getOrCreate = function(collection, name, data) {
    var doc, _base;
    doc = this.get(collection, name);
    if (doc) {
      return doc;
    }
    doc = new Doc(this, collection, name, data);
    collection = ((_base = this.collections)[collection] || (_base[collection] = {}));
    return collection[name] = doc;
  };

  Connection.prototype.query = function(collection, q, autoFetch, callback) {
    var query;
    query = new Query(this, this.nextQueryId++, collection, q);
    query.autoFetch = autoFetch;
    query.once;
    return query;
  };

  return Connection;

})();

/* 
  open: (collection, docName, options, callback) ->
    doc = @openSync collection, name
    doc.on 'ready', ->
      if doc.type and options.type
        doc.create type, -> callback()
      else
        callback()

  openSync: (collection, docName, options = {}) ->
    # options can have:
    # - type:'text'
    # - snapshot:{...}
    # - v:  (if you have a snapshot you also need a version and a type).
    #
    # - subscribe:true / false. Default true.

    
    options.type = ottypes[options.type] if typeof options.type is 'string'

    if typeof options.v is 'number'
      throw new Error 'Missing snapshot' if options.snapshot is undefined
      throw new Error 'Missing type' if options.type is undefined
    else
      delete options.snapshot

    doc = @_get collection, docName
    if doc
      if options.subscribe isnt false
        doc.subscribe()

      return doc

    else
      return @makeDoc collection, docName, options




  makeDoc: (collection, docName, data, callback) ->
    throw new Error("Doc #{docName} already open") if @_get collection, docName
    doc = new Doc(this, collection, docName, data)
    c = (@collections[collection] ||= {})
    c[docName] = doc

    #doc.open (error) =>
    #  if error
    #    delete c[name]
    #  else
    #    doc.on 'closed', => delete c[name]

    #  callback error, (doc unless error)

  # Open a document that already exists
  # callback(error, doc)
  openExisting: (collection, docName, callback) ->
    return callback 'connection closed' if @state is 'stopped'
    doc = @_get collection, docName
    return @_ensureOpenState(doc, callback) if doc
    doc = @makeDoc collection, docName, {}, callback

  # Open a document. It will be created if it doesn't already exist.
  # Callback is passed a document or an error
  # type is either a type name (eg 'text' or 'simple') or the actual type object.
  # Types must be supported by the server.
  # callback(error, doc)
  open: (collection, docName, type, callback) ->
    return callback 'connection closed' if @state is 'stopped'

    # Wait for the connection to open
    if @state is 'connecting'
      @on 'connected', -> @open(collection, docName, type, callback)
      return

    if typeof type is 'function'
      callback = type
      type = 'text'

    callback ||= ->

    type = ottypes[type] if typeof type is 'string'

    throw new Error "OT code for document type missing" unless type

    throw new Error 'Server-generated random doc names are not currently supported' unless docName?

    if (doc = @_get collection, docName)
      if doc.type is type
        @_ensureOpenState(doc, callback)
      else
        callback 'Type mismatch', doc
      return

    @makeDoc collection, docName, {create:true, type:type.name}, callback

  # Call the callback after the document object is open
  _ensureOpenState: (doc, callback) ->
    switch doc.state
      when 'open' then callback null, doc
      when 'opening' then @on 'open', -> callback null, doc
      when 'closed' then doc.open (error) -> callback error, (doc unless error)
    return
*/


if (typeof window === 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Connection);

exports.Connection = Connection;
// Generated by CoffeeScript 1.6.1
var applyChange;

applyChange = function(ctx, oldval, newval) {
  var commonEnd, commonStart;
  if (oldval === newval) {
    return;
  }
  commonStart = 0;
  while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
    commonStart++;
  }
  commonEnd = 0;
  while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) && commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
    commonEnd++;
  }
  if (oldval.length !== commonStart + commonEnd) {
    ctx.remove(commonStart, oldval.length - commonStart - commonEnd);
  }
  if (newval.length !== commonStart + commonEnd) {
    return ctx.insert(commonStart, newval.slice(commonStart, newval.length - commonEnd));
  }
};

window.sharejs.Doc.prototype.attach_textarea = function(elem) {
  var attach, ctx, detach, genOp, insert_listener, remove_listener, replaceText;
  ctx = null;
  replaceText = function(newText, transformCursor) {
    var newSelection, scrollTop;
    newSelection = [transformCursor(elem.selectionStart), transformCursor(elem.selectionEnd)];
    scrollTop = elem.scrollTop;
    elem.value = newText;
    if (elem.scrollTop !== scrollTop) {
      elem.scrollTop = scrollTop;
    }
    if (window.document.activeElement === elem) {
      return elem.selectionStart = newSelection[0], elem.selectionEnd = newSelection[1], newSelection;
    }
  };
  insert_listener = function(pos, text) {
    var prevvalue, transformCursor;
    transformCursor = function(cursor) {
      if (pos < cursor) {
        return cursor + text.length;
      } else {
        return cursor;
      }
    };
    prevvalue = elem.value.replace(/\r\n/g, '\n');
    return replaceText(prevvalue.slice(0, pos) + text + prevvalue.slice(pos), transformCursor);
  };
  remove_listener = function(pos, length) {
    var prevvalue, transformCursor;
    transformCursor = function(cursor) {
      if (pos < cursor) {
        return cursor - Math.min(length, cursor - pos);
      } else {
        return cursor;
      }
    };
    prevvalue = elem.value.replace(/\r\n/g, '\n');
    return replaceText(prevvalue.slice(0, pos) + prevvalue.slice(pos + length), transformCursor);
  };
  genOp = function(event) {
    var onNextTick;
    onNextTick = function(fn) {
      return setTimeout(fn, 0);
    };
    return onNextTick(function() {
      var prevvalue;
      if (elem.value !== prevvalue) {
        prevvalue = elem.value;
        return applyChange(ctx, ctx.getText(), elem.value.replace(/\r\n/g, '\n'));
      }
    });
  };
  attach = function() {
    var event, prevvalue, _i, _len, _ref;
    if (!doc.provides.text) {
      return typeof console !== "undefined" && console !== null ? console.warn('Could not attach document: text api incompatible') : void 0;
    }
    ctx = doc.createEditingContext();
    prevvalue = elem.value = ctx.getText();
    ctx.onInsert = insert_listener;
    ctx.onRemove = remove_listener;
    _ref = ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      event = _ref[_i];
      if (elem.addEventListener) {
        elem.addEventListener(event, genOp, false);
      } else {
        elem.attachEvent('on' + event, genOp);
      }
    }
    return doc.once('deleted', detach);
  };
  detach = elem.detach_share = function() {
    var event, _i, _len, _ref;
    ctx.onInsert = ctx.onRemove = null;
    _ref = ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      event = _ref[_i];
      if (elem.removeEventListener) {
        elem.removeEventListener(event, genOp, false);
      } else {
        elem.detachEvent('on' + event, genOp);
      }
    }
    return doc.once('ready', attach);
  };
  if (doc.type) {
    return attach();
  } else {
    return doc.once('ready', attach);
  }
};
})();
