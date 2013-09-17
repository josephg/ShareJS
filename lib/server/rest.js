// This implements ShareJS's REST API.

var Router = require('express').Router;
var url = require('url');


// ****  Utility functions


var send403 = function(res, message) {
  if (message == null) message = 'Forbidden\n';

  res.writeHead(403, {'Content-Type': 'text/plain'});
  res.end(message);
};

var send404 = function(res, message) {
  if (message == null) message = '404: Your document could not be found.\n';

  res.writeHead(404, {'Content-Type': 'text/plain'});
  res.end(message);
};

var send409 = function(res, message) {
  if (message == null) message = '409: Your operation could not be applied.\n';

  res.writeHead(409, {'Content-Type': 'text/plain'});
  res.end(message);
};

var sendError = function(res, message, head) {
  if (message === 'forbidden') {
    if (head) {
      send403(res, "");
    } else {
      send403(res);
    }
  } else if (message === 'Document created remotely') {
    if (head) {
      send409(res, "");
    } else {
      send409(res, message + '\n');
    }
  } else {
    //console.warn("REST server does not know how to send error:", message);
    if (head) {
      res.writeHead(500, {});
      res.end("");
    } else {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end("Error: " + message + "\n");
    }
  }
};

var send400 = function(res, message) {
  res.writeHead(400, {'Content-Type': 'text/plain'});
  res.end(message);
};

var send200 = function(res, message) {
  if (message == null) message = "OK\n";

  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end(message);
};

var sendJSON = function(res, obj) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(obj) + '\n');
};

// Expect the request to contain JSON data. Read all the data and try to JSON
// parse it.
var expectJSONObject = function(req, res, callback) {
  pump(req, function(data) {
    var obj;
    try {
      obj = JSON.parse(data);
    } catch (err) {
      send400(res, 'Supplied JSON invalid');
      return;
    }

    return callback(obj);
  });
};

var pump = function(req, callback) {
  // Currently using the old streams API..
  var data = '';
  req.on('data', function(chunk) {
    return data += chunk;
  });
  return req.on('end', function() {
    return callback(data);
  });
};



// ***** Actual logic

module.exports = function(share) {
  var router = new Router();

  var auth = function(req, res, next) {
    if (req.session && req.session.shareAgent) {
      req._shareAgent = req.session.shareAgent;
    } else {
      var userAgent = req._shareAgent = share.createAgent(req);
      if (req.session) req.session.shareAgent = userAgent;
    }

    next();
  };

  
  // GET returns the document snapshot. The version and type are sent as headers.
  // I'm not sure what to do with document metadata - it is inaccessable for now.
  router.get('/:cName/:docName', auth, function(req, res, next) {
    req._shareAgent.fetch(req.params.cName, req.params.docName, function(err, doc) {
      if (err) {
        if (req.method === "HEAD") {
          sendError(res, err, true);
        } else {
          sendError(res, err);
        }
        return;
      }

      res.setHeader('X-OT-Version', doc.v);

      if (!doc.type) {
        send404(res, 'Document does not exist\n');
        return;
      }

      res.setHeader('X-OT-Type', doc.type);
      res.setHeader('ETag', doc.v);

      // If not GET request, presume HEAD request
      if (req.method !== 'GET') {
        send200(res, '');
        return;
      }

      var content;
      var query = url.parse(req.url,true).query;
      if (query.envelope == 'true')
      {
        content = doc;
      } else {
        content = doc.data;
      }

      if (typeof doc.data === 'string') {
        send200(res, content);
      } else {
        sendJSON(res, content);
      }
    });
  });

  // Get operations. You can use from:X and to:X to specify the range of ops you want.
  router.get('/:cName/:docName/ops', auth, function(req, res, next) {
    var from = 0, to = null;

    var query = url.parse(req.url, true).query;

    if (query && query.from) from = parseInt(query.from)|0;
    if (query && query.to) to = parseInt(query.to)|0;

    req._shareAgent.getOps(req.params.cName, req.params.docName, from, to, function(err, ops) {
      if (err)
        sendError(res, err);
      else
        sendJSON(res, ops);
    });
  });

  var submit = function(req, res, opData, sendOps) {
    // The backend allows the version to be unspecified - it assumes the most
    // recent version in that case. This is useful behaviour when you want to
    // create a document.
    req._shareAgent.submit(req.params.cName, req.params.docName, opData, {}, function(err, v, ops) {
      if (err) return sendError(res, err);

      res.setHeader('X-OT-Version', v);
      if (sendOps)
        sendJSON(res, ops);
      else
        send200(res);
    });
  };

  // POST submits op data to the document. POST {op:[...], v:100}
  router.post('/:cName/:docName', auth, function(req, res, next) {
    expectJSONObject(req, res, function(opData) {
      submit(req, res, opData, true);
    });
  });
  

  // PUT is used to create a document. The contents are a JSON object with
  // {type:TYPENAME, data:{initial data} meta:{...}}
  // PUT {...} is equivalent to POST {create:{...}}
  router.put('/:cName/:docName', auth, function(req, res, next) {
    expectJSONObject(req, res, function(create) {
      submit(req, res, {create:create});
    });
  });

  // DELETE deletes a document. It is equivalent to POST {del:true}
  router.delete('/:cName/:docName', auth, function(req, res, next) {
    submit(req, res, {del:true});
  });

  return router.middleware;
};

