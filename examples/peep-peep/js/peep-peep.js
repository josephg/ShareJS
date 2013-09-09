'use strict';

$('#message').keyup(function(e) {
  if ((e.keyCode || e.which) == 13) {
    if (!e.srcElement.value) return;
    // enter was pressed
    $state.at('chat').push({
      from: $('#username').val(),
      message: e.srcElement.value
    });
    $(e.srcElement).val(null);
  }
})


function addPost(m) {
  var msg = $('<div class="message"><div class="user"></div><div class="text"></div></div>');
  $('.text', msg).text(m.message);
  $('.user', msg).text(m.from);
  $('#messages').prepend(msg);
}

function newPosts(op) {
  var opel = $('<div class="op">');
  opel.text(JSON.stringify(op));
  $('#ops').prepend(opel);
  op.forEach(function(c) {
    if (c.li) {
      addPost(c.li)
    }
  })
  $('#doc').text(JSON.stringify($state.snapshot))
}

var $state;
sharejs.open("PeepPeep", 'json', function(error, doc) {
  $state = doc;
  doc.on('change', function(op) {
    newPosts(op)
  })
  if (doc.created) {
    doc.at([]).set({
      chat: []
    });
  } else {
    $state.at('chat').get().reverse().forEach(addPost)
    $('#doc').text(JSON.stringify($state.snapshot))
  }
})
