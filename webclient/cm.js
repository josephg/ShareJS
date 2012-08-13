(function () {
  var applyToShareJS;
  var preActionCodemirrorContent;

  applyToShareJS = function (editorDoc, delta, doc) {
    var pos, text;
    change = delta;
    while (1) {
      pos = myIndexFromPos(change.from.line, change.from.ch, preActionCodemirrorContent);
      end_pos = myIndexFromPos(change.to.line, change.to.ch, preActionCodemirrorContent);
      action = '';
      if (change.text[0] == "" && change.text.length == 1) {
        if (change.from.line != change.to.line)
          action = 'removeLines';
        else
          action = 'removeText';
      }
      else {
        if (change.text.length > 1)
          action = 'insertLines';
        else
          action = 'insertText';
      }
      switch (action) {
      case 'insertText':
        if (pos != end_pos)
          doc.del(pos, end_pos - pos);
        doc.insert(pos, change.text[0]);
        break;
      case 'removeText':
        doc.del(pos, end_pos - pos);
        break;
      case 'insertLines':
        if (pos != end_pos)
          doc.del(pos, end_pos - pos);
        text = change.text.join('\n');
        doc.insert(pos, text);
        break;
      case 'removeLines':
        doc.del(pos, end_pos - pos);
        break;
      default:
        throw new Error("unknown action: " + delta.action);
      }

      preActionCodemirrorContent = doc.getText();
      if (!change.next)
        break;
      change = change.next;
    }
  };

  window.sharejs.Doc.prototype.attach_codemirror = function (editor, keepEditorContents) {
    var check, doc, editorDoc, editorListener, suppress;
    if (!this.provides['text']) {
      throw new Error('Only text documents can be attached to CodeMirror');
    }
    doc = this;
    editorDoc = editor;

    check = function () {
      return window.setTimeout(function () {
        var editorText, otText;
        editorText = editorDoc.getValue();
        otText = doc.getText();
        if (editorText !== otText) {
          console.error("Texts are out of sync. Most likely this is caused by a bug in this code.");
        }
      }, 0);
    };
    if (keepEditorContents) {
      doc.del(0, doc.getText().length);
      doc.insert(0, editorDoc.getValue());
    } else {
      editorDoc.setValue(doc.getText());
    }
    preActionCodemirrorContent = editorDoc.getValue();
    check();
    suppress = false;

    doc.onChange = function () {
    }

    editorListener = function (change, tc) {
      if (suppress) return;
      applyToShareJS(editorDoc, tc, doc);
      doc.onChange();
      return check();
    };
    editorDoc.setOption("onChange", editorListener);
    myIndexFromPos = function (line, ch, value) {
      myIndex = 0;
      count = 0;
      lines = value.split("\n");
      for (i = 0; i < lines.length; i++) {
        if (count < line)
          myIndex += lines[i].length + 1
        else {
          myIndex += ch;
          break;
        }
        count++;
      }
      return myIndex;
    }
    doc.on('insert', function (pos, text) {
      suppress = true;
      start = editorDoc.posFromIndex(pos);
      editorDoc.replaceRange(text, start);
      suppress = false;
      preActionCodemirrorContent = editorDoc.getValue();
      return check();
    });
    doc.on('delete', function (pos, text) {
      var range;
      suppress = true;
      start = editorDoc.posFromIndex(pos);
      end = editorDoc.posFromIndex(pos + text.length);
      editorDoc.replaceRange("", start, end);
      suppress = false;
      preActionCodemirrorContent = editorDoc.getValue();
      return check();
    });
    doc.detach_codemirror = function () {
      editorDoc.removeListener('change', editorListener);
      return delete doc.detach_codemirror;
    };
  };

}).call(this);