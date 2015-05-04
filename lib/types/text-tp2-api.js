// Text document API for text-tp2

var type = require('ot-text-tp2').type;
var takeDoc = type._takeDoc;
var append = type._append;

var appendSkipChars = function(op, doc, pos, maxlength) {
  while ((maxlength == null || maxlength > 0) && pos.index < doc.data.length) {
    var part = takeDoc(doc, pos, maxlength, true);
    if (maxlength != null && typeof part === 'string') {
      maxlength -= part.length;
    }
    append(op, part.length || part);
  }
};

type.api = {
  provides: {text: true},

  // Number of characters in the string
  getLength: function() { return this.getSnapshot().charLength; },

  // Flatten the document into a string
  get: function() {
    var snapshot = this.getSnapshot();
    var strings = [];

    for (var i = 0; i < snapshot.data.length; i++) {
      var elem = snapshot.data[i];
      if (typeof elem == 'string') {
        strings.push(elem);
      }
    }

    return strings.join('');
  },

  getText: function() {
    console.warn("`getText()` is deprecated; use `get()` instead.");
    return this.get();
  },

  // Insert text at pos
  insert: function(pos, text, callback) {
    if (pos == null) pos = 0;

    var op = [];
    var docPos = {index: 0, offset: 0};
    var snapshot = this.getSnapshot();

    // Skip to the specified position
    appendSkipChars(op, snapshot, docPos, pos);

    // Append the text
    append(op, {i: text});
    appendSkipChars(op, snapshot, docPos);
    this.submitOp(op, callback);
    return op;
  },

  // Remove length of text at pos
  remove: function(pos, len, callback) {
    var op = [];
    var docPos = {index: 0, offset: 0};
    var snapshot = this.getSnapshot();

    // Skip to the position
    appendSkipChars(op, snapshot, docPos, pos);

    while (len > 0) {
      var part = takeDoc(snapshot, docPos, len, true);

      // We only need to delete actual characters. This should also be valid if
      // we deleted all the tombstones in the document here.
      if (typeof part === 'string') {
        append(op, {d: part.length});
        len -= part.length;
      } else {
        append(op, part);
      }
    }

    appendSkipChars(op, snapshot, docPos);
    this.submitOp(op, callback);
    return op;
  },

  _beforeOp: function() {
    // Its a shame we need this. This also currently relies on snapshots being
    // cloned during apply(). This is used in _onOp below to figure out what
    // text was _actually_ inserted and removed.
    //
    // Maybe instead we should do all the _onOp logic here and store the result
    // then play the events when _onOp is actually called or something.
    this.__prevSnapshot = this.getSnapshot();
  },

  _onOp: function(op) {
    var textPos = 0;
    var docPos = {index:0, offset:0};
    // The snapshot we get here is the document state _AFTER_ the specified op
    // has been applied. That means any deleted characters are now tombstones.
    var prevSnapshot = this.__prevSnapshot;

    for (var i = 0; i < op.length; i++) {
      var component = op[i];
      var part, remainder;

      if (typeof component == 'number') {
        // Skip
        for (remainder = component;
            remainder > 0;
            remainder -= part.length || part) {

          part = takeDoc(prevSnapshot, docPos, remainder);
          if (typeof part === 'string')
            textPos += part.length;
        }
      } else if (component.i != null) {
        // Insert
        if (typeof component.i == 'string') {
          // ... and its an insert of text, not insert of tombstones
          if (this.onInsert) this.onInsert(textPos, component.i);
          textPos += component.i.length;
        }
      } else {
        // Delete
        for (remainder = component.d;
            remainder > 0;
            remainder -= part.length || part) {

          part = takeDoc(prevSnapshot, docPos, remainder);
          if (typeof part == 'string' && this.onRemove)
            this.onRemove(textPos, part.length);
        }
      }
    }
  }
};
