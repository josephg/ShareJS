ShareJS
=======

[![Join the chat at https://gitter.im/share/ShareJS](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/share/ShareJS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

This is a little server & client library to allow concurrent editing of any
kind of content via OT. The server runs on NodeJS and the client works in NodeJS or a
web browser.

ShareJS currently supports operational transform on plain-text and arbitrary JSON data.

**Visit [Google groups](https://groups.google.com/forum/?fromgroups#!forum/sharejs) for discussions and announcements**

**Check out the [live interactive demos](http://sharejs.org/).**

**Immerse yourself in [API Documentation](https://github.com/josephg/ShareJS/wiki).**

[![Build Status](https://secure.travis-ci.org/share/ShareJS.png)](http://travis-ci.org/share/ShareJS)


Browser support
---------------

ShareJS **should** work with all browsers, down to IE5.5 (although IE support
hasn't been tested with the new version).

That said, I only test regularly with FF, Safari and Chrome, and occasionally
with IE8+. **File bug reports if you have issues**


Installing and running
----------------------

    # npm install share

Run the example server with:

    # coffee node_modules/share/examples/server.coffee

> Not all of the sharejs 0.6 examples have been ported across yet. I'd love
> some pull requests!

ShareJS depends on [LiveDB](https://github.com/share/livedb) for its database
backend & data model. Read the livedb readme for information on how to
configure your database.

Run the tests:

    # npm install
    # mocha


## Server API

To get started with the server API, you need to do 2 things:

- Decide where your data is going to be stored. You can mess around using
the livedb inmemory store. For more options, see the [livedb
api](https://github.com/share/livedb).
- Decide how your client and server will communicate. The easiest solution is
to use [browserchannel](https://github.com/josephg/node-browserchannel).

To create a ShareJS server instance:

```javascript
var livedb = require('livedb');
var sharejs = require('share');

var backend = livedb.client(livedb.memory());
var share = require('share').server.createClient({backend: backend});
```

The method is called `createClient` because its sort of a client of the
database... its a weird name, just roll with it.

The sharejs server instance has 3 methods you might care about:

- To communicate with a client, create a node stream which can communicate with
a client and use **share.listen(stream)** to hand control of the stream to
sharejs. See the section below on client server communication for an example of
this.
- **share.rest()** returns a connect/express router which exposes the sharejs
REST API. This code is in the process of moving to its own repo. In the
meantime, the [documentation is
here](https://github.com/share/rest/blob/master/README.md#exposed-methods)
- You can intercept requests to the livedb backend to do access control using
sharejs middleware. **share.use(method, function(action, callback){...})** will
make your function intercept & potentially rewrite requests. This is not
currently documented, but when it is, the documentation [will live
here](https://github.com/share/middleware/blob/master/README.md).


## Client server communication

ShareJS requires *you* to provide a way for the client to communicate with the
server. As such, its transport agnostic. You can use
[browserchannel](https://github.com/josephg/node-browserchannel),
[websockets](https://github.com/einaros/ws), or whatever you like. ShareJS
requires the transport to:

- Guarantee in-order message delivery. (**Danger danger socket.io does not guarantee this**)
- Provide a websocket-like API on the client
- Provide a node object stream to the server to talk to a client.

When a client times out, the server will throw away all information
related to that client. When the client client reconnects, it will reestablish
all its state on the server again.

It is the responsibility of the transport to handle reconnection - the client
should emit state change events to tell sharejs that it has reconnected.

### Server communication

The server exposes a method `share.listen(stream)` which you can call with a
node stream which can communicate with the client.

Here's an example using browserchannel:

```javascript
var Duplex = require('stream').Duplex;
var browserChannel = require('browserchannel').server

var share = require('share').server.createClient({backend: ...});
var app = require('express')();

app.use(browserChannel({webserver: webserver}, function(client) {
  var stream = new Duplex({objectMode: true});

  stream._read = function() {};
  stream._write = function(chunk, encoding, callback) {
    if (client.state !== 'closed') {
      client.send(chunk);
    }
    callback();
  };

  client.on('message', function(data) {
    stream.push(data);
  });

  client.on('close', function(reason) {
    stream.push(null);
    stream.emit('close');
  });

  stream.on('end', function() {
    client.close();
  });

  // Give the stream to sharejs
  return share.listen(stream);
}));
```

And [here](examples/ws.coffee) is a more complete example using websockets.

### Client communication

The client needs a
[websocket](https://developer.mozilla.org/en-US/docs/WebSockets)-like session
object to communicate. You can use a normal websocket if you want:

```javascript
var ws = new WebSocket('ws://' + window.location.host);
var share = new sharejs.Connection(ws);
```

Sharejs also supports the following changes from the spec:

- The socket can reconnect. Simply call `socket.onopen` again when the socket
reconnects and sharejs will reestablish its session state and send any
outstanding user data.
- If your underlying API allows data to be sent while in the CONNECTING state,
set `socket.canSendWhileConnecting = true`.
- If your API allows JSON messages, set `socket.canSendJSON = true` to avoid
extra JSON stringifying.

If you use browserchannel, all of this is done for you. Simply tell
browserchannel to reconnect and it'll take care of everything:

```javascript
var socket = new BCSocket(null, {reconnect: true});
var share = new sharejs.Connection(socket);
```

---

## Client API

The client API can be used either from nodejs or from a browser.

From the server:

```javascript
var connection = require('share').client.Connection(socket);
```

From the browser, you'll need to first include the sharejs library. You can use
browserify and require('share').client or include the script directly.

The browser library is built to the `node_modules/share/webclient` directory
when you install sharejs. This path is exposed programatically at
`require('share').scriptsDir`. You can add this to your express app:

```javascript
var sharejs = require('share');
app.use(express.static(sharejs.scriptsDir));
```

Then in your web app include whichever OT types you need in your app and sharejs:

```html
<script src="text.js"></script>
<script src="json0.js"></script>
<script src="share.js"></script>
```

This will create a global `sharejs` object in the browser.

### Connections

The client exposes 2 classes you care about:

- The **Connection** class wraps a socket and handles the communication to the
sharejs server. You use the connection instance to create document references
in the client.
- All actual data you edit will be wrapped by the **Doc** class. The document
class stores an in-memory copy of the document data with your local edits
applied.  Create a document instance by calling `connection.get('collection', 'docname')`.

> ShareJS also allows you to make queries to your database. Live-bound queries
will return a **Query** object. These are not currently documented.

To get started, you first need to create a connection:

```javascript
var sjs = new sharejs.Connection(socket);
```

The socket must be a websocket-like object. See the section on client server
communication for details about how to create a socket.

The most important method of the connection object is .get:

**connection.get(collection, docname)**: Get a document reference to the named
document on the server. This function returns the same document reference each
time you call connection.get(). *collection* and *docname* are both strings.

Connections also expose methods for executing queries:

- **createFetchQuery(index, query, options, callback)**: Executes a query against the backend and returns a set of documents matching the query via the callback.
- **createSubscribeQuery(index, query, options, callback)**: Run a query against the backend and keep the result set live. Returns a **Query** object via the callback.

The best documentation for these functions is in a [block comment in the code](https://github.com/share/ShareJS/blob/ff9676d347bd50320c4f1bde080c6b2ae7599333/lib/client/connection.js#L456-L506).

For debugging, connections have 2 additional properties:

- Set **connection.debug = true** to console.log out all messages sent and
recieved over the wire.
- **connection.messageBuffer** contains the last 100 messages, for debugging
error states.

### Documents

Document objects store your actual data in the client. They can be modified
syncronously and they can automatically sync their data with the server.
Document objects can be modified offline - they will send data to the server
when the client reconnects.

Normally you will create a document object by calling
**connection.get(collection, docname)**. Destroy the document reference using
**doc.destroy()**.

Documents start in a dumb, inert state. You have three options to get started:

- Normally, you want to call **doc.subscribe(callback)**. This will fetch the
current data from the server and subscribe the document object to a feed of
changes from other clients. (If you don't want to be subscribed anymore, call
**doc.unsubscribe([callback])**).
- If you don't want a live feed of changes, call **doc.fetch(callback)** to get
the data from the server. Your local document will be updated automatically
every time you submit an operation.
- If you know the document doesn't exist on the server (for example the doc
name is a new GUID), you can immediately call **doc.create(type, data,
callback)**.

> There's a secret 4th option - if you're doing server-side rendering, you can
> initialize the document object with bundled data by calling
> **doc.ingestData({type:..., data:...})**.

To call a method when a document has the current server data, pair your call to
subscribe with **doc.whenReady(function() { ... }**. Your function will be
called immediately if the document already has data.

Both subscribe and fetch take a callback which will be called when the
operation is complete. In ShareJS 0.8 this callback is being removed - most of
the time you should call whenReady instead. The semantics are a little
different in each case - the subscribe / fetch callbacks are called when the
operation has completed (successfully or unsuccessfully). Its possible for a
subscription to fail, but succeed when the client reconnects. On the other
hand, whenReady is called once there's data. It will not be called if there was
an error subscribing.

Once you have data, you should call **doc.getSnapshot()** to get it. Note that
this returns the doc's internal doc object. You should never modify the
snapshot directly - instead call doc.submitOp.

#### Editing documents

Documents follow the [sharejs / livedb object
model](https://github.com/share/livedb#data-model). All documents sort of
implicitly exist on the server, but they have no data and no type until you
'create' them. So you can subscribe to a document before it has been created on
the server, and a document on the server can be deleted and recreated without
you needing a new document reference.

To make changes to a document, you can call one of these three methods:

- **doc.create(type, [data], [context], [callback])**: Create the document on
the server with the given type and initial data. Type will usually be 'text'
or 'json0'. Data specifies initial data for the document. For text documents,
this should be an initial string. For JSON documents, this should be JSON
stringify-able data. If unspecified, initial data is an empty string or null
for text and JSON, respectively.
- **doc.submitOp(op, [context], [callback])**: Submit an operation to the
document. The operation must be valid for the given OT type of the document.
See the [text document OT
spec](https://github.com/ottypes/text/blob/master/README.md) and the [JSON
document OT
spec](https://github.com/ottypes/json0/blob/master/README.md). Consider using a
context instead of calling submitOp directly. (Described below)
- **doc.del([context], [callback])**: Delete the document on the server. The
document reference will become null.

In all cases, the `context` argument is a user data object which is passed to
all event emitters related to this operation. This is designed so data bindings
can easily ignore their own events.

The callback for all editing operations is optional and informational. It will
be called when the operation has been acknowledged by the server.

To be notified when edits happen remotely, register for the 'op' event. (See events section below).

If you want to pause sending operations to the server, call **doc.pause()**.
This is useful if a user wants to edit a document without other people seeing
their changes. Call **doc.resume()** to unpause & send any pending changes to
the server.

#### Editing Contexts

The other option to edit documents is to use a **Document editing context**.
Document contexts are thin wrappers around submitOp which provide two benefits:

1. An editing context does not get notified about its own operations, but it
does get notified about the operations performed by other contexts editing
the same document. This solves the problem that multiple parts of your app may
bind to the same document.
2. Editing contexts mix in API methods for the OT type of the document. This
makes it easier to edit the document. Note that the JSON API is currently a
bit broken, so this is currently only useful for text documents.

Create a context using **context = doc.createContext()**. Contexts have the
following methods & properties:

- **context.submitOp(op, callback)**: Wrapper for `doc.submitOp(op, context, callback)`.
- **context.\_onOp = function(op) {...}** This is a hook for you / the type API
to add your own logic when operations happen. If you're using the text API,
bind to **context.onInsert = ...** and **context.onRemove = ...** instead.
- **context.destroy()**: Destroy the context. The context will stop getting
messages.

If you're making a text edit binding, bind to a document context instead of
binding to the document itself.


#### Document events

In the nodejs tradition, documents are event emitters. They emit the following events:

- **ready**: Emitted when the document has data from the server. Consider using
**whenReady(callback)** instead of this event so your function is called
immediately if the document *already* has data from the server.
- **subscribe**: Emitted when the document is subscribed. This will be
re-emitted when the document is resubscribed each time the client reconnects.
- **unsubscribe**: Emitted when the document is unsubscribed. This will be
re-emitted whenever the document is unsubscribed due to the client being
disconnected.
- **nothing pending**: Emitted after sending data to the server, when there are
no outstanding operations to send. Pair with **hasPending** to find out when
there is outstanding data. This is useful for displaying "Are you sure you want
to close your browser window" messages to the user.


- **create**: Emitted when the document has been created. Called with (context).
- **del**: Emitted when the document has been deleted. The del event is triggered with (context, oldSnapshot).
- **before op**: Emitted right before an operation is applied. Called with (op, context).
- **op**: Emitted right after each part of an operation is applied. Called with
(op, context). This is usually called just once, but you can specify
`doc.incremental = true` to tell the document to break the operation into
smaller parts and emit them one at a time.
- **after op**: Emitted after an operation (all of it) is applied. Called with (op, context).

Operations lock the document. For probably bad reasons, it is illegal to call
submitOp in the event handlers for *create*, *del*, *before op* or *op* events. If you
want to make changes in response to an operation, register for the *after op* or *unlock* events.


#### Examples

Here's some code to get started editing a text document:

```html
<textarea id='pad' autofocus>Connecting...</textarea>
<script src="channel/bcsocket.js"></script>
<script src="text.js"></script>
<script src="share.js"></script>
<script>
var socket = new BCSocket(null, {reconnect: true});
var sjs = new sharejs.Connection(socket);

var doc = sjs.get('docs', 'hello');

// Subscribe to changes
doc.subscribe();

// This will be called when we have a live copy of the server's data.
doc.whenReady(function() {
  console.log('doc ready, data: ', doc.getSnapshot());
  
  // Create a JSON document with value x:5
  if (!doc.type) doc.create('text');
  doc.attachTextarea(document.getElementById('pad'));
});
```

And a JSON document:

```javascript
var socket = ...;
var sjs = new sharejs.Connection(socket);

var doc = sjs.get('users', 'seph');

// Subscribe to changes
doc.subscribe();

// This will be called when we have a live copy of the server's data.
doc.whenReady(function() {
  console.log('doc ready, data: ', doc.getSnapshot());
  
  // Create a JSON document with value x:5
  if (!doc.type) doc.create('json0', {x:5});
});

// later, add 10 to the doc.snapshot.x property
doc.submitOp([{p:['x'], na:10}]);
```

See the [examples directory](https://github.com/share/ShareJS/tree/master/examples/public) for more examples.


---

# License

ShareJS is proudly licensed under the [MIT license](LICENSE).

