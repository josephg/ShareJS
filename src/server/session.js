var AUTH_TIMEOUT, hat, syncQueue;

hat = require('hat');

syncQueue = require('./syncqueue');

AUTH_TIMEOUT = 10000;

exports.handler = function(session, createAgent) {
  var abort, agent, buffer, bufferMsg, close, data, docState, failAuthentication, handleClose, handleMessage, handleOp, handleOpenCreateSnapshot, lastReceivedDoc, lastSentDoc, open, send, timeout;
  data = {
    headers: session.headers,
    remoteAddress: session.address
  };
  agent = null;
  lastSentDoc = null;
  lastReceivedDoc = null;
  docState = {};
  abort = function() {
    if (session.stop) {
      return session.stop();
    } else {
      return session.close();
    }
  };
  handleMessage = function(query) {
    var error, _name, _ref, _ref1, _ref2;
    error = null;
    if (!(query.doc === null || typeof query.doc === 'string' || (query.doc === void 0 && lastReceivedDoc))) {
      error = 'Invalid docName';
    }
    if ((_ref = query.create) !== true && _ref !== (void 0)) {
      error = "'create' must be true or missing";
    }
    if ((_ref1 = query.open) !== true && _ref1 !== false && _ref1 !== (void 0)) {
      error = "'open' must be true, false or missing";
    }
    if ((_ref2 = query.snapshot) !== null && _ref2 !== (void 0)) {
      error = "'snapshot' must be null or missing";
    }
    if (!(query.type === void 0 || typeof query.type === 'string')) {
      error = "'type' invalid";
    }
    if (!(query.v === void 0 || (typeof query.v === 'number' && query.v >= 0))) {
      error = "'v' invalid";
    }
    if (error) {
      console.warn("Invalid query " + query + " from " + agent.sessionId + ": " + error);
      return abort();
    }
    if (query.doc === null) {
      query.doc = lastReceivedDoc = hat();
    } else if (query.doc !== void 0) {
      lastReceivedDoc = query.doc;
    } else {
      if (!lastReceivedDoc) {
        console.warn("msg.doc missing in query " + query + " from " + agent.sessionId);
        return abort();
      }
      query.doc = lastReceivedDoc;
    }
    docState[_name = query.doc] || (docState[_name] = {
      queue: syncQueue(function(query, callback) {
        var _ref3;
        if (!docState) {
          return callback();
        }
        if (query.open === false) {
          return handleClose(query, callback);
        } else if (query.open || query.snapshot === null || query.create) {
          return handleOpenCreateSnapshot(query, callback);
        } else if ((query.op != null) || (((_ref3 = query.meta) != null ? _ref3.path : void 0) != null)) {
          return handleOp(query, callback);
        } else {
          console.warn("Invalid query " + (JSON.stringify(query)) + " from " + agent.sessionId);
          abort();
          return callback();
        }
      })
    });
    return docState[query.doc].queue(query);
  };
  send = function(response) {
    if (response.doc === lastSentDoc) {
      delete response.doc;
    } else {
      lastSentDoc = response.doc;
    }
    if (session.ready()) {
      return session.send(response);
    }
  };
  open = function(docName, version, callback) {
    var listener;
    if (!docState) {
      return callback('Session closed');
    }
    if (docState[docName].listener) {
      return callback('Document already open');
    }
    docState[docName].listener = listener = function(opData) {
      var opMsg;
      if (!(docState != null ? docState[docName] : void 0)) {
        return;
      }
      if (docState[docName].listener !== listener) {
        throw new Error('Consistency violation - doc listener invalid');
      }
      if (opData.meta.source === agent.sessionId) {
        return;
      }
      opMsg = {
        doc: docName,
        op: opData.op,
        v: opData.v,
        meta: opData.meta
      };
      return send(opMsg);
    };
    return agent.listen(docName, version, listener, function(error, v) {
      if (error && docState) {
        delete docState[docName].listener;
      }
      return callback(error, v);
    });
  };
  close = function(docName, callback) {
    var listener;
    if (!docState) {
      return callback('Session closed');
    }
    listener = docState[docName].listener;
    if (listener == null) {
      return callback('Doc already closed');
    }
    agent.removeListener(docName);
    delete docState[docName].listener;
    return callback();
  };
  handleOpenCreateSnapshot = function(query, finished) {
    var callback, docData, docName, msg, step1Create, step2Snapshot, step3Open;
    docName = query.doc;
    msg = {
      doc: docName
    };
    callback = function(error) {
      if (error) {
        if (msg.open === true) {
          close(docName);
        }
        if (query.open === true) {
          msg.open = false;
        }
        if (query.snapshot !== void 0) {
          msg.snapshot = null;
        }
        delete msg.create;
        msg.error = error;
      }
      send(msg);
      return finished();
    };
    if (query.doc == null) {
      return callback('No docName specified');
    }
    if (query.create === true) {
      if (typeof query.type !== 'string') {
        return callback('create:true requires type specified');
      }
    }
    if (query.meta !== void 0) {
      if (!(typeof query.meta === 'object' && Array.isArray(query.meta) === false)) {
        return callback('meta must be an object');
      }
    }
    docData = void 0;
    step1Create = function() {
      if (query.create !== true) {
        return step2Snapshot();
      }
      if (docData) {
        msg.create = false;
        return step2Snapshot();
      } else {
        return agent.create(docName, query.type, query.meta || {}, function(error) {
          if (error === 'Document already exists') {
            return agent.getSnapshot(docName, function(error, data) {
              if (error) {
                return callback(error);
              }
              docData = data;
              msg.create = false;
              return step2Snapshot();
            });
          } else if (error) {
            return callback(error);
          } else {
            msg.create = true;
            return step2Snapshot();
          }
        });
      }
    };
    step2Snapshot = function() {
      if (query.snapshot !== null || msg.create === true) {
        step3Open();
        return;
      }
      if (docData) {
        msg.v = docData.v;
        if (query.type !== docData.type.name) {
          msg.type = docData.type.name;
        }
        msg.snapshot = docData.snapshot;
      } else {
        return callback('Document does not exist');
      }
      return step3Open();
    };
    step3Open = function() {
      if (query.open !== true) {
        return callback();
      }
      if (query.type && docData && query.type !== docData.type.name) {
        return callback('Type mismatch');
      }
      return open(docName, query.v, function(error, version) {
        if (error) {
          return callback(error);
        }
        msg.open = true;
        msg.v = version;
        return callback();
      });
    };
    if (query.snapshot === null || query.open === true) {
      return agent.getSnapshot(query.doc, function(error, data) {
        if (error && error !== 'Document does not exist') {
          return callback(error);
        }
        docData = data;
        return step1Create();
      });
    } else {
      return step1Create();
    }
  };
  handleClose = function(query, callback) {
    return close(query.doc, function(error) {
      if (error) {
        send({
          doc: query.doc,
          open: false,
          error: error
        });
      } else {
        send({
          doc: query.doc,
          open: false
        });
      }
      return callback();
    });
  };
  handleOp = function(query, callback) {
    var opData, _ref;
    opData = {
      v: query.v,
      op: query.op,
      meta: query.meta,
      dupIfSource: query.dupIfSource
    };
    return agent.submitOp(query.doc, opData, !(opData.op != null) && (((_ref = opData.meta) != null ? _ref.path : void 0) != null) ? callback : function(error, appliedVersion) {
      var msg;
      msg = error ? {
        doc: query.doc,
        v: null,
        error: error
      } : {
        doc: query.doc,
        v: appliedVersion
      };
      send(msg);
      return callback();
    });
  };
  failAuthentication = function(error) {
    session.send({
      auth: null,
      error: error
    });
    return session.stop();
  };
  timeout = setTimeout(function() {
    return failAuthentication('Timeout waiting for client auth message');
  }, AUTH_TIMEOUT);
  buffer = [];
  session.on('message', bufferMsg = function(msg) {
    if (typeof msg.auth !== 'undefined') {
      clearTimeout(timeout);
      data.authentication = msg.auth;
      return createAgent(data, function(error, agent_) {
        var _i, _len;
        if (error) {
          return failAuthentication(error);
        } else {
          agent = agent_;
          session.send({
            auth: agent.sessionId
          });
          session.removeListener('message', bufferMsg);
          for (_i = 0, _len = buffer.length; _i < _len; _i++) {
            msg = buffer[_i];
            handleMessage(msg);
          }
          buffer = null;
          return session.on('message', handleMessage);
        }
      });
    } else {
      return buffer.push(msg);
    }
  });
  return session.on('close', function() {
    var docName, listener;
    if (!agent) {
      return;
    }
    for (docName in docState) {
      listener = docState[docName].listener;
      if (listener) {
        agent.removeListener(docName);
      }
    }
    return docState = null;
  });
};
