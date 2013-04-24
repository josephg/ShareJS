// Text document API for the 'text' type.

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
