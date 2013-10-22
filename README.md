ShareJS
=======

---

## You are looking at the 0.7 alpha branch of ShareJS.

For the stable 0.6 branch that you will get if you `npm install share`, look [in the 0.6 branch](https://github.com/share/ShareJS/tree/0.6).

ShareJS 0.7 is a complete rewrite of ShareJS 0.6. *Most* APIs have changed, at
least slightly. Motivation for the new design is discussed [in a blog post
here](https://josephg.com/blog/sharejs)
and [I demo the new features here](http://www.youtube.com/watch?v=uDzME15UxVM).

A [list of changes from 0.6 is here](https://github.com/share/ShareJS/wiki/Changelog).

> *Welcome.* So you know, this code is [feature incomplete](https://github.com/share/ShareJS/wiki/0.7-Status).
> The API and the code are unstable, and there are known bugs. Test
> coverage has dropped from 90% in ShareJS 0.6 to around 50% and documentation
> of the new APIs is largely nonexistant.
>
> The documentation below is also full of lies. If you want to play with the
> new version of ShareJS anyway, look at the examples in prototype/.
>
> I understand that if you're using racer & derby, you will use this code
> anyway despite my warnings. If you run into issues, please file issues so I can fix them.

---


This is a little server (& client library) to allow concurrent editing of any
kind of content. The server runs on NodeJS and the client works in NodeJS or a
web browser.

ShareJS currently supports operational transform on plain-text and arbitrary JSON data.

**Immerse yourself in [API Documentation](https://github.com/josephg/ShareJS/wiki).**

**Visit [Google groups](https://groups.google.com/forum/?fromgroups#!forum/sharejs) for discussions and announcements**

**Check out the [live interactive demos](http://sharejs.org/).**

[![Build Status](https://secure.travis-ci.org/share/ShareJS.png)](http://travis-ci.org/share/ShareJS)


Browser support
---------------

ShareJS **should** work with all browsers, down to IE5.5 (although IE support hasn't been tested with the new version).

That said, I only test regularly with FF, Safari and Chrome, and occasionally with IE8+. **File bug reports if you have issues**




Client-side setup
-----------------
Load the ShareJS distribution from `dist/share.js` into your browser and require the
connection class
```html
<script src="/share.js"></script>
<script>
  var ShareConnection = require('share').Connection
</script>
```
If ShareJS is a dependency in your npm package. you can make a custom build of
the the client library using [browserify](https://npmjs.org/package/browserify)
```js
var b = require('browserify');
b.require('share/lib/client');
b.add('./awesome/share/extension');
```
If you want to use the OT type API for editing contexts you also have to add
them to the bunlde with `b.add('share/lib/types')`.

**TODO** Explain exposed API, OT types


Examples
--------

Run examples with `grunt example:<name>` and have a look at the code under
`examples/name`. Be sure to run `grunt dist` first. Currently available examples are

* **Text.** Share a simple textarea.
* **SockJS.** Share a simple textarea using [SockJS](sockjs.org).




Testing
-------

Running `grunt` starts a watch task for development.  Using `grunt test` all
tests are just executed once.  Passing the `--debug` option to the grunt tasks
makes the share server dump the communication with clients.

All tests are located under the `test` directory. Browser tests are contained in
`test/browser` and node tests are located in `test/server`.
