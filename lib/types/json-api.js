// JSON document API for the 'json0' type.

var type = require('ot-json0').type;

// Helpers

function depath(path) {
  if (path.length === 1 && path[0].constructor === Array) {
    return path[0];
  } else {
    return path;
  }
}

function traverse(snapshot, path) {
  var key = 'data';
  var elem = { data: snapshot };

  for (var i = 0; i < path.length; i++) {
    elem = elem[key];
    key = path[i];
    if (typeof elem === 'undefined') {
      throw new Error('bad path');
    }
  }

  return {
    elem: elem,
    key: key
  };
}

function pathEquals(p1, p2) {
  if (p1.length !== p2.length) {
    return false;
  }
  for (var i = 0; i < p1.length; ++i) {
    if (p1[i] !== p2[i]) {
      return false;
    }
  }
  return true;
}

function containsPath(p1, p2) {
  if (p1.length < p2.length) return false;
  return pathEquals( p1.slice(0,p2.length), p2);
}

// does nothing, used as a default callback
function nullFunction() {}

// given a path represented as an array or a number, normalize to an array
// whole numbers are converted to integers.
function normalizePath(path) {
  if (path instanceof Array) {
    return path;
  }
  if (typeof(path) == "number") {
    return [path];
  }
  // if (typeof(path) == "string") {
  //   path = path.split(".");
  //   var out = [];
  //   for (var i=0; i<path.length; i++) {
  //     var part = path[i];
  //     if (String(parseInt(part, 10)) == part) {
  //       out.push(parseInt(part, 10));
  //     } else {
  //       out.push(part);
  //     }
  //   }
  //   return out;
  // }
}

// helper for creating functions with the method signature func([path],arg1,arg2,...,[cb])
// populates an array of arguments with a default path and callback
function normalizeArgs(obj, args, func, requiredArgsCount){
  args = Array.prototype.slice.call(args);
  var path_prefix = obj.path || [];

  if (func.length > 1 && typeof args[args.length-1] !== 'function') {
    args.push(nullFunction);
  }

  if (args.length < (requiredArgsCount || func.length)) {
    args.unshift(path_prefix);
  } else {
    args[0] = path_prefix.concat(normalizePath(args[0]));
  }

  return func.apply(obj,args);
}


// SubDoc
// this object is returned from context.createContextAt()

var SubDoc = function(context, path) {
  this.context = context;
  this.path = path || [];
};

SubDoc.prototype._updatePath = function(op){
  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    if(c.lm !== undefined && containsPath(this.path,c.p)){
      var new_path_prefix = c.p.slice(0,c.p.length-1);
      new_path_prefix.push(c.lm);
      this.path = new_path_prefix.concat(this.path.slice(new_path_prefix.length));
    }
  }
};

SubDoc.prototype.createContextAt = function() {
  var path = 1 <= arguments.length ? Array.prototype.slice.call(arguments, 0) : [];
  return this.context.createContextAt(this.path.concat(depath(path)));
};

SubDoc.prototype.get = function(path) {
  return normalizeArgs(this, arguments, function(path){
    return this.context.get(path);
  });
};

SubDoc.prototype.set = function(path, value, cb) {
  return normalizeArgs(this, arguments, function(path, value, cb){
    return this.context.set(path, value, cb);
  });
};

SubDoc.prototype.insert = function(path, value, cb) {
  return normalizeArgs(this, arguments, function(path, value, cb){
    return this.context.insert(path, value, cb);
  });
};

SubDoc.prototype.remove = function(path, len, cb) {
  return normalizeArgs(this, arguments, function(path, len, cb) {
    return this.context.remove(path, len, cb);
  }, 2);
};

SubDoc.prototype.push = function(path, value, cb) {
  return normalizeArgs(this, arguments, function(path, value, cb) {
      var _ref = traverse(this.context.getSnapshot(), path);
      var len = _ref.elem[_ref.key].length;
      path.push(len);
    return this.context.insert(path, value, cb);
  });
};

SubDoc.prototype.move = function(path, from, to, cb) {
  return normalizeArgs(this, arguments, function(path, from, to, cb) {
    return this.context.move(path, from, to, cb);
  });
};

SubDoc.prototype.add = function(path, amount, cb) {
  return normalizeArgs(this, arguments, function(path, amount, cb) {
    return this.context.add(path, amount, cb);
  });
};

SubDoc.prototype.on = function(event, cb) {
  return this.context.addListener(this.path, event, cb);
};

SubDoc.prototype.removeListener = function(l) {
  return this.context.removeListener(l);
};

SubDoc.prototype.getLength = function(path) {
  return normalizeArgs(this, arguments, function(path) {
    return this.context.getLength(path);
  });
};

// DEPRECATED
SubDoc.prototype.getText = function(path) {
  return normalizeArgs(this, arguments, function(path) {
    return this.context.getText(path);
  });
};

// DEPRECATED
SubDoc.prototype.deleteText = function(path, pos, length, cb) {
  return normalizeArgs(this, arguments, function(path, pos, length, cb) {
    return this.context.deleteText(path, length, pos, cb);
  });
};

SubDoc.prototype.destroy = function() {
  this.context._removeSubDoc(this);
};


// JSON API methods
// these methods are mixed in to the context return from doc.createContext()

type.api = {

  provides: {
    json: true
  },

  _fixComponentPaths: function(c) {
    if (!this._listeners) {
      return;
    }
    if (c.na !== undefined || c.si !== undefined || c.sd !== undefined) {
      return;
    }

    var to_remove = [];
    var _ref = this._listeners;

    for (var i = 0; i < _ref.length; i++) {
      var l = _ref[i];
      var dummy = {
        p: l.path,
        na: 0
      };
      var xformed = type.transformComponent([], dummy, c, 'left');
      if (xformed.length === 0) {
        to_remove.push(i);
      } else if (xformed.length === 1) {
        l.path = xformed[0].p;
      } else {
        throw new Error("Bad assumption in json-api: xforming an 'na' op will always result in 0 or 1 components.");
      }
    }

    to_remove.sort(function(a, b) {
      return b - a;
    });

    var _results = [];
    for (var j = 0; j < to_remove.length; j++) {
      i = to_remove[j];
      _results.push(this._listeners.splice(i, 1));
    }

    return _results;
  },

  _fixPaths: function(op) {
    var _results = [];
    for (var i = 0; i < op.length; i++) {
      var c = op[i];
      _results.push(this._fixComponentPaths(c));
    }
    return _results;
  },

  _submit: function(op, callback) {
    this._fixPaths(op);
    return this.submitOp(op, callback);
  },

  _addSubDoc: function(subdoc){
    this._subdocs || (this._subdocs = []);
    this._subdocs.push(subdoc);
  },

  _removeSubDoc: function(subdoc){
    this._subdocs || (this._subdocs = []);
    for(var i = 0; i < this._subdocs.length; i++){
      if(this._subdocs[i] === subdoc) this._subdocs.splice(i,1);
      return;
    }
  },

  _updateSubdocPaths: function(op){
    this._subdocs || (this._subdocs = []);
    for(var i = 0; i < this._subdocs.length; i++){
      this._subdocs[i]._updatePath(op);
    }
  },

  createContextAt: function() {
    var path = 1 <= arguments.length ? Array.prototype.slice.call(arguments, 0) : [];
    var subdoc =  new SubDoc(this, depath(path));
    this._addSubDoc(subdoc);
    return subdoc;
  },

  get: function(path) {
    if (!path) return this.getSnapshot();
    return normalizeArgs(this,arguments,function(path){
      var _ref = traverse(this.getSnapshot(), path);
      return _ref.elem[_ref.key];
    });
  },

  set: function(path, value, cb) {
    return normalizeArgs(this, arguments, function(path, value, cb) {
      var _ref = traverse(this.getSnapshot(), path);
      var elem = _ref.elem;
      var key = _ref.key;
      var op = {
        p: path
      };

      if (elem.constructor === Array) {
        op.li = value;
        if (typeof elem[key] !== 'undefined') {
          op.ld = elem[key];
        }
      } else if (typeof elem === 'object') {
        op.oi = value;
        if (typeof elem[key] !== 'undefined') {
          op.od = elem[key];
        }
      } else {
        throw new Error('bad path');
      }

      return this._submit([op], cb);
    });
  },

  remove: function(path, len, cb) {
    return normalizeArgs(this, arguments, function(path, len, cb) {
      if (!cb && len instanceof Function) {
        cb = len;
        len = null;
      }
      // if there is no len argument, then we are removing a single item from either a list or a hash
      var _ref, elem, op, key;
      if (len === null || len === undefined) {
        _ref = traverse(this.getSnapshot(), path);
        elem = _ref.elem;
        key = _ref.key;
        op = {
          p: path
        };

        if (typeof elem[key] === 'undefined') {
          throw new Error('no element at that path');
        }

        if (elem.constructor === Array) {
          op.ld = elem[key];
        } else if (typeof elem === 'object') {
          op.od = elem[key];
        } else {
          throw new Error('bad path');
        }
        return this._submit([op], cb);
      } else {
        var pos;
        pos = path.pop();
        _ref = traverse(this.getSnapshot(), path);
        elem = _ref.elem;
        key = _ref.key;
        if (typeof elem[key] === 'string') {
          op = {
            p: path.concat(pos),
            sd: _ref.elem[_ref.key].slice(pos, pos + len)
          };
          return this._submit([op], cb);
        } else if (elem[key].constructor === Array) {
          var ops = [];
          for (var i=pos; i<pos+len; i++) {
            ops.push({
              p: path.concat(pos),
              ld: elem[key][i]
            });
          }
          return this._submit(ops, cb);
        } else {
          throw new Error('element at path does not support range');
        }
      }
    }, 2);
  },

  insert: function(path, value, cb) {
    return normalizeArgs(this, arguments, function(path, value, cb) {
      var pos = path.pop();
      var _ref = traverse(this.getSnapshot(), path);
      var elem = _ref.elem;
      var key = _ref.key;
      var op = {
        p: path.concat(pos)
      };

      if (elem[key].constructor === Array) {
        op.li = value;
      } else if (typeof elem[key] === 'string') {
        op.si = value;
      }
      return this._submit([op], cb);
    });
  },

  move: function(path, from, to, cb) {
    return normalizeArgs(this, arguments, function(path, from, to, cb) {
      var self = this;
      var op = [
        {
          p: path.concat(from),
          lm: to
        }
      ];

      return this._submit(op, function(){
        self._updateSubdocPaths(op);
        if(cb) cb.apply(cb, arguments);
      });
    });
  },

  push: function(path, value, cb) {
    return normalizeArgs(this, arguments, function(path, value, cb) {
      var _ref = traverse(this.getSnapshot(), path);
      var len = _ref.elem[_ref.key].length;
      path.push(len);
      return this.insert(path, value, cb);
    });
  },

  add: function(path, amount, cb) {
    return normalizeArgs(this, arguments, function(path, value, cb) {
      var op = [
        {
          p: path,
          na: amount
        }
      ];
      return this._submit(op, cb);
    });
  },

  getLength: function(path) {
      return normalizeArgs(this, arguments, function(path) {
        return this.get(path).length;
      });
  },

  getText: function(path) {
    return normalizeArgs(this, arguments, function(path) {
      console.warn("Deprecated. Use `get()` instead");
      return this.get(path);
    });
  },

  deleteText: function(path, length, pos, cb) {
    return normalizeArgs(this, arguments, function(path, length, pos, cb) {
      console.warn("Deprecated. Use `remove(path, length, cb)` instead");
      var _ref = traverse(this.getSnapshot(), path);
      var op = [
        {
          p: path.concat(pos),
          sd: _ref.elem[_ref.key].slice(pos, pos + length)
        }
      ];

      return this._submit(op, cb);
    });
  },

  addListener: function(path, event, cb) {
    return normalizeArgs(this, arguments, function(path, value, cb) {
      var listener = {
        path: path,
        event: event,
        cb: cb
      };
      this._listeners || (this._listeners = []);
      this._listeners.push(listener);
      return listener;
    });
  },

  removeListener: function(listener) {
    if (!this._listeners) {
      return;
    }
    var i = this._listeners.indexOf(listener);
    if (i < 0) {
      return false;
    }
    this._listeners.splice(i, 1);
    return true;
  },

  _onOp: function(op) {
    for (var i = 0; i < op.length; i++) {
      var c = op[i];
      this._fixComponentPaths(c);

      if(c.lm !== undefined) {
        this._updateSubdocPaths([c]);
      }

      var match_path = c.na === undefined ? c.p.slice(0, c.p.length - 1) : c.p;

      for (var l = 0; l < this._listeners.length; l++) {
        var listener = this._listeners[l];
        var cb = listener.cb;

        if (pathEquals(listener.path, match_path)) {
          switch (listener.event) {
            case 'insert':
              if (c.li !== undefined && c.ld === undefined) {
                cb(c.p[c.p.length - 1], c.li);
              } else if (c.oi !== undefined && c.od === undefined) {
                cb(c.p[c.p.length - 1], c.oi);
              } else if (c.si !== undefined) {
                cb(c.p[c.p.length - 1], c.si);
              }
              break;
            case 'delete':
              if (c.li === undefined && c.ld !== undefined) {
                cb(c.p[c.p.length - 1], c.ld);
              } else if (c.oi === undefined && c.od !== undefined) {
                cb(c.p[c.p.length - 1], c.od);
              } else if (c.sd !== undefined) {
                cb(c.p[c.p.length - 1], c.sd);
              }
              break;
            case 'replace':
              if (c.li !== undefined && c.ld !== undefined) {
                cb(c.p[c.p.length - 1], c.ld, c.li);
              } else if (c.oi !== undefined && c.od !== undefined) {
                cb(c.p[c.p.length - 1], c.od, c.oi);
              }
              break;
            case 'move':
              if (c.lm !== undefined) {
                cb(c.p[c.p.length - 1], c.lm);
              }
              break;
            case 'add':
              if (c.na !== undefined) {
                cb(c.na);
              }
          }
        }

        if (type.canOpAffectPath(c, listener.path) && listener.event === 'child op') {
          var child_path = c.p.slice(listener.path.length);
          cb(child_path, c);
        }
      }
    }
  }
};
