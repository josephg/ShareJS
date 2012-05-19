(function() {

  /**
   @const
   @type {boolean}
*/
var WEB = true;
;

  var checkMop, exports, meta;

  exports = window['sharejs'];

  checkMop = function(meta, mop) {
    var _ref, _ref2;
    if (mop.id) {
      if (typeof mop.id !== 'string') throw new Error("invalid id " + mop.id);
      if (!mop.as && !meta.sessions[mop.id]) {
        throw new Error("Referenced session ID missing");
      }
      if (mop.p && ((_ref = mop.p) === 'cursor')) {
        throw new Error("Cannot change property " + mop.p);
      }
      if (mop.source && mop.source !== mop.id) {
        throw new Error("Not allowed to change another client's session data");
      }
      if (mop.as && typeof mop.as !== 'object') {
        throw new Error("Session objects must be objects");
      }
    } else {
      if (mop.p && ((_ref2 = mop.p) === 'sessions' || _ref2 === 'ctime' || _ref2 === 'mtime')) {
        throw new Error("Cannot change property " + mop.p);
      }
      if (mop.source) {
        throw new Error("Only the server can change the root document metadata");
      }
    }
  };

  meta = {
    name: 'meta',
    create: function(meta) {
      var now;
      now = Date.now();
      meta || (meta = {});
      meta.sessions = {};
      meta.ctime = now;
      meta.mtime = now;
      return meta;
    },
    applyOp: function(meta, type, opData, side) {
      var id, session, _ref, _ref2, _ref3;
      if (side == null) side = 'left';
      if ((_ref = opData.meta) != null ? _ref.ts : void 0) {
        meta.mtime = opData.meta.ts;
        if ((_ref2 = meta.ctime) == null) meta.ctime = meta.mtime;
      }
      if (type.transformCursor) {
        _ref3 = meta.sessions;
        for (id in _ref3) {
          session = _ref3[id];
          if (session.cursor != null) {
            session.cursor = type.transformCursor(session.cursor, opData.op, side);
          }
        }
      }
      return meta;
    },
    transform: function(type, mop, op, side) {
      if ((mop.c != null) && type.transformCursor) {
        type.transformCursor(mop.c, op, side);
      }
      return mop;
    },
    applyMop: function(meta, mop) {
      checkMop(meta, mop);
      if (mop.n) {
        meta.sessions = mop.n.sessions;
        meta.ctime = mop.n.ctime;
        meta.mtime = mop.n.mtime;
      } else if (mop.as) {
        meta.sessions[mop.id] = mop.as;
      } else if (mop.rs) {
        delete meta.sessions[mop.id];
      } else if (mop.c != null) {
        meta.sessions[mop.id].cursor = mop.c;
      } else if (mop.p) {
        if (mop.id) {
          if (mop.v === void 0) {
            delete meta.sessions[mop.id][mop.p];
          } else {
            meta.sessions[mop.id][mop.p] = mop.v;
          }
        } else {
          if (mop.v === void 0) {
            delete meta[mop.p];
          } else {
            meta[mop.p] = mop.v;
          }
        }
      }
      return meta;
    }
  };

  if (typeof WEB !== "undefined" && WEB !== null) {
    exports.meta = meta;
  } else {
    module.exports = meta;
  }

}).call(this);
