This directory contains wrappers for the OT types. The types themselves are in [josephg/ot-types](https://github.com/josephg/ot-types).

The wrapper methods are mixed into the client's Doc object when a document is created.
They are designed to give users better, more consistant APIs for constructing operations. All of the text bindings use
the nice APIs so if you want to invent your own wacky type, you can still use all the editor bindings.

For example, the three text types defined here (text, text-composable and text-tp2) all provide the text API, supplying
`.insert()`, `.del()`, `.getLength` and `.getText` methods.

See text-api.js for an example.

