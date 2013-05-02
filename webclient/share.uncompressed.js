(function(){
(function(){var e,r,t,n,o,s,i={exports:{}},a=i.exports;a.name="text",a.uri="http://sharejs.org/types/textv1",a.create=function(e){if(null!=e&&"string"!=typeof e)throw Error("Initial data must be a string");return e||""},e=function(e){var r,t,n,o;if(!Array.isArray(e))throw Error("Op must be an array of components");for(t=null,n=0,o=e.length;o>n;n++){switch(r=e[n],typeof r){case"object":if(!("number"==typeof r.d&&r.d>0))throw Error("Object components must be deletes of size > 0");break;case"string":if(!(r.length>0))throw Error("Inserts cannot be empty");break;case"number":if(!(r>0))throw Error("Skip components must be >0");if("number"==typeof t)throw Error("Adjacent skip components should be combined")}t=r}if("number"==typeof t)throw Error("Op has a trailing skip")},t=function(e){return function(r){return r&&0!==r.d?0===e.length?e.push(r):typeof r==typeof e[e.length-1]?"object"==typeof r?e[e.length-1].d+=r.d:e[e.length-1]+=r:e.push(r):void 0}},n=function(e){var r,t,n,o;return r=0,t=0,o=function(n,o){var s,i;return r===e.length?-1===n?null:n:(s=e[r],"number"==typeof s?-1===n||n>=s-t?(i=s-t,++r,t=0,i):(t+=n,n):"string"==typeof s?-1===n||"i"===o||n>=s.length-t?(i=s.slice(t),++r,t=0,i):(i=s.slice(t,t+n),t+=n,i):-1===n||"d"===o||n>=s.d-t?(i={d:s.d-t},++r,t=0,i):(t+=n,{d:n}))},n=function(){return e[r]},[o,n]},r=function(e){return"number"==typeof e?e:e.length||e.d},s=function(e){return e.length>0&&"number"==typeof e[e.length-1]&&e.pop(),e},a.normalize=function(e){var r,n,o,i,a;for(o=[],r=t(o),i=0,a=e.length;a>i;i++)n=e[i],r(n);return s(o)},a.apply=function(r,t){var n,o,s,i,a;if("string"!=typeof r)throw Error("Snapshot should be a string");for(e(t),s=0,o=[],i=0,a=t.length;a>i;i++)switch(n=t[i],typeof n){case"number":if(n>r.length)throw Error("The op is too long for this document");o.push(r.slice(0,n)),r=r.slice(n);break;case"string":o.push(n);break;case"object":r=r.slice(n.d)}return o.join("")+r},a.transform=function(o,i,a){var c,f,u,h,p,b,l,g,m,y,d;if("left"!==a&&"right"!==a)throw Error("side ("+a+") must be 'left' or 'right'");for(e(o),e(i),p=[],c=t(p),d=n(o),g=d[0],l=d[1],m=0,y=i.length;y>m;m++)switch(u=i[m],typeof u){case"number":for(h=u;h>0;)f=g(h,"i"),c(f),"string"!=typeof f&&(h-=r(f));break;case"string":"left"===a&&(b=l(),"string"==typeof b&&c(g(-1))),c(u.length);break;case"object":for(h=u.d;h>0;)switch(f=g(h,"i"),typeof f){case"number":h-=f;break;case"string":c(f);break;case"object":h-=f.d}}for(;u=g(-1);)c(u);return s(p)},a.compose=function(o,i){var a,c,f,u,h,p,b,l,g,m;for(e(o),e(i),h=[],a=t(h),m=n(o),p=m[0],b=m[1],l=0,g=i.length;g>l;l++)switch(f=i[l],typeof f){case"number":for(u=f;u>0;)c=p(u,"d"),a(c),"object"!=typeof c&&(u-=r(c));break;case"string":a(f);break;case"object":for(u=f.d;u>0;)switch(c=p(u,"d"),typeof c){case"number":a({d:c}),u-=c;break;case"string":u-=c.length;break;case"object":a(c)}}for(;f=p(-1);)a(f);return s(h)},o=function(e,r){var t,n,o,s;for(n=0,o=0,s=r.length;s>o&&(t=r[o],!(n>=e));o++)switch(typeof t){case"number":if(n+t>=e)return e;n+=t;break;case"string":n+=t.length,e+=t.length;break;case"object":e-=Math.min(t.d,e-n)}return e},a.transformCursor=function(e,r,t){var n,s,i,a;if(s=0,t){for(i=0,a=r.length;a>i;i++)switch(n=r[i],typeof n){case"number":s+=n;break;case"string":s+=n.length}return[s,s]}return[o(e[0],r),o(e[1],r)]};var c=window.ottypes=window.ottypes||{},f=i.exports;c[f.name]=f,f.uri&&(c[f.uri]=f)})();// Text document API for the 'text' type.

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
(function(){var e={exports:{}},i=e.exports;i._bootstrapTransform=function(e,i,n,r){var t,o;return t=function(e,n,r,t){return i(r,e,n,"left"),i(t,n,e,"right")},e.transformX=e.transformX=o=function(e,i){var l,p,d,f,s,a,u,c,h,v,g,m,y,w,O,b,k,E,x;for(n(e),n(i),s=[],v=0,w=i.length;w>v;v++){for(h=i[v],f=[],l=0;e.length>l;){if(a=[],t(e[l],h,f,a),l++,1!==a.length){if(0===a.length){for(E=e.slice(l),g=0,O=E.length;O>g;g++)p=E[g],r(f,p);h=null;break}for(x=o(e.slice(l),a),d=x[0],c=x[1],m=0,b=d.length;b>m;m++)p=d[m],r(f,p);for(y=0,k=c.length;k>y;y++)u=c[y],r(s,u);h=null;break}h=a[0]}null!=h&&r(s,h),e=f}return[e,s]},e.transform=e.transform=function(e,n,r){if("left"!==r&&"right"!==r)throw Error("type must be 'left' or 'right'");return 0===n.length?e:1===e.length&&1===n.length?i([],e[0],n[0],r):"left"===r?o(e,n)[0]:o(n,e)[1]}};var n,r,t,o,l,p,d,f;p={name:"text-old",uri:"http://sharejs.org/types/textv0",create:function(){return""}},l=function(e,i,n){return e.slice(0,i)+n+e.slice(i)},r=function(e){var i,n;if("number"!=typeof e.p)throw Error("component missing position field");if(n=typeof e.i,i=typeof e.d,!("string"===n^"string"===i))throw Error("component needs an i or d field");if(!(e.p>=0))throw Error("position cannot be negative")},t=function(e){var i,n,t;for(n=0,t=e.length;t>n;n++)i=e[n],r(i);return!0},p.apply=function(e,i){var n,r,o,p;for(t(i),o=0,p=i.length;p>o;o++)if(n=i[o],null!=n.i)e=l(e,n.p,n.i);else{if(r=e.slice(n.p,n.p+n.d.length),n.d!==r)throw Error("Delete component '"+n.d+"' does not match deleted text '"+r+"'");e=e.slice(0,n.p)+e.slice(n.p+n.d.length)}return e},p._append=n=function(e,i){var n,r,t;if(""!==i.i&&""!==i.d)return 0===e.length?e.push(i):(n=e[e.length-1],null!=n.i&&null!=i.i&&n.p<=(r=i.p)&&n.p+n.i.length>=r?e[e.length-1]={i:l(n.i,i.p-n.p,i.i),p:n.p}:null!=n.d&&null!=i.d&&i.p<=(t=n.p)&&i.p+i.d.length>=t?e[e.length-1]={d:l(i.d,n.p-i.p,n.d),p:i.p}:e.push(i))},p.compose=function(e,i){var r,o,l,p;for(t(e),t(i),o=e.slice(),l=0,p=i.length;p>l;l++)r=i[l],n(o,r);return o},p.compress=function(e){return p.compose([],e)},p.normalize=function(e){var i,r,t,o,l;for(r=[],(null!=e.i||null!=e.p)&&(e=[e]),t=0,o=e.length;o>t;t++)i=e[t],null==(l=i.p)&&(i.p=0),n(r,i);return r},f=function(e,i,n){return null!=i.i?e>i.p||i.p===e&&n?e+i.i.length:e:i.p>=e?e:i.p+i.d.length>=e?i.p:e-i.d.length},p.transformCursor=function(e,i,n){var r,t,o,l;for(t="right"===n,o=0,l=i.length;l>o;o++)r=i[o],e=f(e,r,t);return e},p._tc=d=function(e,i,r,o){var l,p,d,s,a,u;if(t([i]),t([r]),null!=i.i)n(e,{i:i.i,p:f(i.p,r,"right"===o)});else if(null!=r.i)u=i.d,i.p<r.p&&(n(e,{d:u.slice(0,r.p-i.p),p:i.p}),u=u.slice(r.p-i.p)),""!==u&&n(e,{d:u,p:i.p+r.i.length});else if(i.p>=r.p+r.d.length)n(e,{d:i.d,p:i.p-r.d.length});else if(i.p+i.d.length<=r.p)n(e,i);else{if(s={d:"",p:i.p},i.p<r.p&&(s.d=i.d.slice(0,r.p-i.p)),i.p+i.d.length>r.p+r.d.length&&(s.d+=i.d.slice(r.p+r.d.length-i.p)),d=Math.max(i.p,r.p),p=Math.min(i.p+i.d.length,r.p+r.d.length),l=i.d.slice(d-i.p,p-i.p),a=r.d.slice(d-r.p,p-r.p),l!==a)throw Error("Delete ops delete different text in the same region of the document");""!==s.d&&(s.p=f(s.p,r),n(e,s))}return e},o=function(e){return null!=e.i?{d:e.i,p:e.p}:{i:e.d,p:e.p}},p.invert=function(e){var i,n,r,t,l;for(t=e.slice().reverse(),l=[],n=0,r=t.length;r>n;n++)i=t[n],l.push(o(i));return l},"undefined"==typeof require?i._bootstrapTransform(p,p.transformComponent,p.checkValidOp,p.append):require("./helpers")._bootstrapTransform(p,p.transformComponent,p.checkValidOp,p.append),e.exports=p;var s=function(e){return"[object Array]"==Object.prototype.toString.call(e)},a=function(e){return JSON.parse(JSON.stringify(e))},p="undefined"!=typeof require?require("./text-old"):window.ottypes.text,u={name:"json0",uri:"http://sharejs.org/types/JSONv0"};u.create=function(e){return void 0===e?null:e},u.invertComponent=function(e){var i={p:e.p};return void 0!==e.si&&(i.sd=e.si),void 0!==e.sd&&(i.si=e.sd),void 0!==e.oi&&(i.od=e.oi),void 0!==e.od&&(i.oi=e.od),void 0!==e.li&&(i.ld=e.li),void 0!==e.ld&&(i.li=e.ld),void 0!==e.na&&(i.na=-e.na),void 0!==e.lm&&(i.lm=e.p[e.p.length-1],i.p=e.p.slice(0,e.p.length-1).concat([e.lm])),i},u.invert=function(e){for(var i=e.slice().reverse(),n=[],r=0;i.length>r;r++)n.push(u.invertComponent(i[r]));return n},u.checkValidOp=function(e){for(var i=0;e.length>i;i++)if(!s(e[i].p))throw Error("Missing path")},u.checkList=function(e){if(!s(e))throw Error("Referenced element not a list")},u.checkObj=function(e){if(e.constructor!==Object)throw Error("Referenced element not an object (it was "+JSON.stringify(e)+")")},u.apply=function(e,i){u.checkValidOp(i),i=a(i);for(var n={data:e},r=0;i.length>r;r++){for(var t=i[r],o=null,l=null,p=n,d="data",f=0;t.p.length>f;f++){var s=t.p[f];if(o=p,l=d,p=p[d],d=s,null==o)throw Error("Path invalid")}if(void 0!==t.na){if("number"!=typeof p[d])throw Error("Referenced element not a number");p[d]+=t.na}else if(void 0!==t.si){if("string"!=typeof p)throw Error("Referenced element not a string (it was "+JSON.stringify(p)+")");o[l]=p.slice(0,d)+t.si+p.slice(d)}else if(void 0!==t.sd){if("string"!=typeof p)throw Error("Referenced element not a string");if(p.slice(d,d+t.sd.length)!==t.sd)throw Error("Deleted string does not match");o[l]=p.slice(0,d)+p.slice(d+t.sd.length)}else if(void 0!==t.li&&void 0!==t.ld)u.checkList(p),p[d]=t.li;else if(void 0!==t.li)u.checkList(p),p.splice(d,0,t.li);else if(void 0!==t.ld)u.checkList(p),p.splice(d,1);else if(void 0!==t.lm){if(u.checkList(p),t.lm!=d){var c=p[d];p.splice(d,1),p.splice(t.lm,0,c)}}else if(void 0!==t.oi)u.checkObj(p),p[d]=t.oi;else{if(void 0===t.od)throw Error("invalid / missing instruction in op");u.checkObj(p),delete p[d]}}return n.data},u.incrementalApply=function(e,i,n){for(var r=0;i.length>r;r++){var t=[i[r]];e=u.apply(e,t),n(t,e)}return e},u.pathMatches=function(e,i,n){if(e.length!=i.length)return!1;for(var r=0;e.length>r;r++){var t=e[r];if(t!==i[r]&&(!n||r!==e.length-1))return!1}return!0},u.append=function(e,i){i=a(i);var n;0!=e.length&&u.pathMatches(i.p,(n=e[e.length-1]).p)?void 0!==n.na&&void 0!==i.na?e[e.length-1]={p:n.p,na:n.na+i.na}:void 0!==n.li&&void 0===i.li&&i.ld===n.li?void 0!==n.ld?delete n.li:e.pop():void 0!==n.od&&void 0===n.oi&&void 0!==i.oi&&void 0===i.od?n.oi=i.oi:void 0!==i.lm&&i.p[i.p.length-1]===i.lm||e.push(i):e.push(i)},u.compose=function(e,i){u.checkValidOp(e),u.checkValidOp(i);for(var n=a(e),r=0;i.length>r;r++)u.append(n,i[r]);return n},u.normalize=function(e){var i=[];e=s(e)?e:[e];for(var n=0;e.length>n;n++){var r=e[n];null==r.p&&(r.p=[]),u.append(i,r)}return i},u.canOpAffectOp=function(e,i){if(0===e.length)return!0;if(0===i.length)return!1;i=i.slice(0,i.length-1),e=e.slice(0,e.length-1);for(var n=0;e.length>n;n++){var r=e[n];if(n>=i.length)return!1;if(r!=i[n])return!1}return!0},u.transformComponent=function(e,i,n,r){i=a(i),void 0!==i.na&&i.p.push(0),void 0!==n.na&&n.p.push(0);var t;u.canOpAffectOp(n.p,i.p)&&(t=n.p.length-1);var o;u.canOpAffectOp(i.p,n.p)&&(o=i.p.length-1);var l=i.p.length,d=n.p.length;if(void 0!==i.na&&i.p.pop(),void 0!==n.na&&n.p.pop(),n.na){if(null!=o&&d>=l&&n.p[o]==i.p[o])if(void 0!==i.ld){var f=a(n);f.p=f.p.slice(l),i.ld=u.apply(a(i.ld),[f])}else if(void 0!==i.od){var f=a(n);f.p=f.p.slice(l),i.od=u.apply(a(i.od),[f])}return u.append(e,i),e}if(null!=o&&d>l&&i.p[o]==n.p[o])if(void 0!==i.ld){var f=a(n);f.p=f.p.slice(l),i.ld=u.apply(a(i.ld),[f])}else if(void 0!==i.od){var f=a(n);f.p=f.p.slice(l),i.od=u.apply(a(i.od),[f])}if(null!=t){var s=l==d;if(void 0!==n.na);else if(void 0!==n.si||void 0!==n.sd){if(void 0!==i.si||void 0!==i.sd){if(!s)throw Error("must be a string?");var c=function(e){var i={p:e.p[e.p.length-1]};return null!=e.si?i.i=e.si:i.d=e.sd,i},h=c(i),v=c(n),g=[];p._tc(g,h,v,r);for(var m=0;g.length>m;m++){var y=g[m],w={p:i.p.slice(0,t)};w.p.push(y.p),null!=y.i&&(w.si=y.i),null!=y.d&&(w.sd=y.d),u.append(e,w)}return e}}else if(void 0!==n.li&&void 0!==n.ld){if(n.p[t]===i.p[t]){if(!s)return e;if(void 0!==i.ld){if(void 0===i.li||"left"!==r)return e;i.ld=a(n.li)}}}else if(void 0!==n.li)void 0!==i.li&&void 0===i.ld&&s&&i.p[t]===n.p[t]?"right"===r&&i.p[t]++:n.p[t]<=i.p[t]&&i.p[t]++,void 0!==i.lm&&s&&n.p[t]<=i.lm&&i.lm++;else if(void 0!==n.ld){if(void 0!==i.lm&&s){if(n.p[t]===i.p[t])return e;var O=n.p[t],b=i.p[t],k=i.lm;(k>O||O===k&&k>b)&&i.lm--}if(n.p[t]<i.p[t])i.p[t]--;else if(n.p[t]===i.p[t]){if(l>d)return e;if(void 0!==i.ld){if(void 0===i.li)return e;delete i.ld}}}else if(void 0!==n.lm)if(void 0!==i.lm&&l===d){var b=i.p[t],k=i.lm,E=n.p[t],x=n.lm;if(E!==x)if(b===E){if("left"!==r)return e;i.p[t]=x,b===k&&(i.lm=x)}else b>E&&i.p[t]--,b>x?i.p[t]++:b===x&&E>x&&(i.p[t]++,b===k&&i.lm++),k>E?i.lm--:k===E&&k>b&&i.lm--,k>x?i.lm++:k===x&&(x>E&&k>b||E>x&&b>k?"right"===r&&i.lm++:k>b?i.lm++:k===E&&i.lm--)}else if(void 0!==i.li&&void 0===i.ld&&s){var b=n.p[t],k=n.lm;O=i.p[t],O>b&&i.p[t]--,O>k&&i.p[t]++}else{var b=n.p[t],k=n.lm;O=i.p[t],O===b?i.p[t]=k:(O>b&&i.p[t]--,O>k?i.p[t]++:O===k&&b>k&&i.p[t]++)}else if(void 0!==n.oi&&void 0!==n.od){if(i.p[t]===n.p[t]){if(void 0===i.oi||!s)return e;if("right"===r)return e;i.od=n.oi}}else if(void 0!==n.oi){if(void 0!==i.oi&&i.p[t]===n.p[t]){if("left"!==r)return e;u.append(e,{p:i.p,od:n.oi})}}else if(void 0!==n.od&&i.p[t]==n.p[t]){if(!s)return e;if(void 0===i.oi)return e;delete i.od}}return u.append(e,i),e},"undefined"!=typeof require?require("./helpers")._bootstrapTransform(u,u.transformComponent,u.checkValidOp,u.append):i._bootstrapTransform(u,u.transformComponent,u.checkValidOp,u.append),e.exports=u;var c=window.ottypes=window.ottypes||{},h=e.exports;c[h.name]=h,h.uri&&(c[h.uri]=h)})();// This file is included at the top of the compiled client JS.

// All the modules will just add stuff to exports, and it'll all get exported.
var exports = window.sharejs = {version: '0.7.0'};

// This is a simple rewrite of microevent.js. I've changed the
// function names to be consistent with node.js EventEmitter.
//
// microevent.js is copyright Jerome Etienne, and licensed under the MIT license:
// https://github.com/jeromeetienne/microevent.js

var MicroEvent = function() {};

MicroEvent.prototype.on = function(event, fn) {
  var events = this._events = this._events || {};
  (events[event] = events[event] || []).push(fn);
};

MicroEvent.prototype.removeListener = function(event, fn) {
  var events = this._events = this._events || {};
  var listeners = events[event] = events[event] || [];

  // Sadly, no IE8 support for indexOf.
  var i = 0;
  while (i < listeners.length) {
    if (listeners[i] === fn) {
      listeners[i] = undefined;
    }
    i++;
  }

  // Compact the list when no event handler is actually running.
  setTimeout(function() {
    events[event] = [];
    var fn;
    for (var i = 0; i < listeners.length; i++) {
      // Only add back event handlers which exist.
      if ((fn = listeners[i])) events[event].push(fn);
    }
  }, 0);
};

MicroEvent.prototype.emit = function(event) {
  var events = this._events;
  var args = Array.prototype.splice.call(arguments, 1);

  if (!events || !events[event]) {
    if (event == 'error') {
      if (console) {
        console.error.apply(console, args);
      }
    }
    return;
  }

  var listeners = events[event];
  for (var i = 0; i < listeners.length; i++) {
    if (listeners[i]) {
      listeners[i].apply(this, args);
    }
  }
};

MicroEvent.prototype.once = function(event, fn) {
  var listener, _this = this;
  this.on(event, listener = function() {
    _this.removeListener(event, listener);
    fn.apply(_this, arguments);
  });
};

MicroEvent.mixin = function(obj) {
  var proto = obj.prototype || obj;
  proto.on = MicroEvent.prototype.on;
  proto.removeListener = MicroEvent.prototype.removeListener;
  proto.emit = MicroEvent.prototype.emit;
  proto.once = MicroEvent.prototype.once;
  return obj;
};

if (typeof module !== "undefined") module.exports = MicroEvent;

var types, MicroEvent;

if (typeof require !== "undefined") {
  types = require('ot-types');
  MicroEvent = require('./microevent');
} else {
  types = window.ottypes;
}

/*
 * A Doc is a client's view on a sharejs document.
 *
 * Documents should not be created directly. Create them by calling the
 * document getting functions in connection.
 *
 * Documents are event emitters. Use doc.on(eventname, fn) to subscribe.
 *
 * Documents currently get mixed in with their type's API methods. So, you can
 * .insert('foo', 0) into a text document and stuff like that.
 *
 * Events:
 * - before op (op, localSite): Fired before an operation is applied to the
 *   document.
 * - op (op, localSite): Fired right after an operation (or part of an
 *   operation) has been applied to the document. Submitting another op here is
 *   invalid - wait until 'after op' if you want to submit more operations.  -
 *   changed (op)
 * - after op (op, localSite): Fired after an operation has been applied. You
 *   can submit more ops here.
 * - subscribed (error): The document was subscribed
 * - unsubscribed (error): The document was unsubscribed
 * - created: The document was created. That means its type was set and it has
 *   some initial data.
 * - error
 */
var Doc = exports.Doc = function(connection, collection, name, data) {
  this.connection = connection;

  this.collection = collection;
  this.name = name;

  this.version = null;

  // Do we automatically connect when our connection to the server
  // is restarted?
  this.wantSubscribe = false;

  // The state according to the server.
  //
  // Possible values:
  // - unsubscribed
  // - subscribing
  // - subscribed
  // - unsubscribing
  this.state = 'unsubscribed'

  // Do we have a document snapshot at a known version on the server?  If
  // this.ready is true, this.version must be set to a version and
  // this.snapshot cannot be undefined.
  this.ready = false;

  // This doesn't provide any standard API access right now.
  this.provides = {};

  // The editing contexts. These are usually instances of the type API when the
  // document is ready for edits.
  this.editingContexts = [];
  
  // The op that is currently roundtripping to the server, or null.
  //
  // When the connection reconnects, the inflight op is resubmitted.
  //
  // This has the same format as an entry in pendingData, which is:
  // {[create:{...}], [del:true], [op:...], callbacks:[...], src:, seq:}
  this.inflightData = null;

  // All ops that are waiting for the server to acknowledge @inflightData
  // This used to just be a single operation, but creates & deletes can't be composed with
  // regular operations.
  //
  // This is a list of {[create:{...}], [del:true], [op:...], callbacks:[...]}
  this.pendingData = [];

  if (data && data.snapshot !== undefined) {
    this._injestData(data);
  }
};

// The callback will be called at a time when the document has a snapshot and
// you can start applying operations. This may be immediately.
Doc.prototype.whenReady = function(fn) {
  if (this.ready) {
    fn();
  } else {
    this.on('ready', fn);
  }
};

// Send a message to the connection from this document. Do not call this
// directly.
Doc.prototype._send = function(message) {
  message.c = this.collection;
  message.doc = this.name;
  this.connection.send(message);
};

// Open the document. There is no callback and no error handling if you're
// already connected.
//
// Only call this once per document.
Doc.prototype.subscribe = function() {
  this.wantSubscribe = true;
  this.flush();
};

Doc.prototype.unsubscribe = function() {
  this.wantSubscribe = false;
  this.flush();
};

// Call to request fresh data from the server.
Doc.prototype.fetch = function() {
  if (!this.ready || this.state !== 'subscribed')
    this._send({a: 'fetch'});
};

// Called whenever (you guessed it!) the connection state changes. This will
// happen when we get disconnected & reconnect.
Doc.prototype._onConnectionStateChanged = function(state, reason) {
  if (state === 'connecting') {
    if (this.inflightData) {
      this._sendOpData(this.inflightData);
    } else {
      this.flush();
    }
  } else if (state === 'disconnected') {
    if (this.state !== 'unsubscribed')
      this.emit('unsubscribed');

    this.state = 'unsubscribed';
  }
};

// This creates and returns an editing context using the current OT type.
Doc.prototype.createContext = function() {
  var type = this.type;
  if (!type) throw new Error('Missing type');

  // I could use the prototype chain to do this instead, but Object.create
  // isn't defined on old browsers. This will be fine.
  var doc = this;
  var context = {
    getSnapshot: function() {
      return doc.snapshot;
    },
    submitOp: function(op, callback) {
      doc.submitOp(op, context, callback);
    },
    destroy: function() {
      if (this.detach) {
        this.detach();
        // Don't double-detach.
        delete this.detach;
      }
      // It will be removed from the actual editingContexts list next time
      // we receive an op on the document (and the list is iterated through).
      //
      // This is potentially dodgy, allowing a memory leak if you create &
      // destroy a whole bunch of contexts without receiving or sending any ops
      // to the document.
      delete this._onOp;
      this.remove = true;
    },

    // This is dangerous, but really really useful for debugging. I hope people
    // don't depend on it.
    _doc: this,
  };

  if (type.api) {
    // Copy everything else from the type's API into the editing context.
    for (k in type.api) {
      context[k] = type.api[k];
    }
  } else {
    context.provides = {};
  }

  this.editingContexts.push(context);

  return context;
};

Doc.prototype.removeContexts = function() {
  if (this.editingContexts) {
    for (var i = 0; i < this.editingContexts.length; i++) {
      this.editingContexts[i].destroy();
    }
  }
  this.editingContexts.length = 0;
};

// Set the document's type, and associated properties. Most of the logic in
// this function exists to update the document based on any added & removed API
// methods.
Doc.prototype._setType = function(newType) {
  if (typeof newType === 'string') {
    if (!types[newType]) throw new Error("Missing type " + newType);
    newType = types[newType];
  }
  this.removeContexts();

  // Set the new type
  this.type = newType;

  // If we removed the type from the object, also remove its snapshot.
  if (!newType) {
    delete this.snapshot;
    this.provides = {};
  } else if (newType.api) {
    // Register the new type's API.
    this.provides = newType.api.provides;
  }
};

// Injest snapshot data. This data must include a version, snapshot and type.
// This is used both to injest data that was exported with a webpage and data
// that was received from the server during a fetch.
Doc.prototype._injestData = function(data) {
  if (typeof data.v !== 'number') throw new Error('Missing version in injested data');
  if (this.ready) {
    if (typeof console !== "undefined") console.warn('Ignoring extra attempt to injest data');
    return;
  }

  if (this.pendingData.length) {
    // We've done ops locally, which have to include a create. Make sure the
    // document hasn't been created by someone else.
    if (data.type) {
      // Uh oh. Error all the pending ops.
      for (var p = 0; p < this.pendingData.length; p++) {
        var callbacks = this.pendingData[p].callbacks;
        for (var i = 0; i < callbacks.length; i++) {
          callbacks[i]('Document already exists');
        }
      }
      this.pendingData.length = 0;
      this._setType(null);
    }
  }

  this.version = data.v;
  if (!this.type) {
    this.snapshot = data.snapshot;
    this._setType(data.type);
  }

  this.ready = true;
  this.emit('ready');
};



// ************ Dealing with operations.

// Helper function to set opData to contain a no-op.
var setNoOp = function(opData) {
  delete opData.op;
  delete opData.create;
  delete opData.del;
};

var isNoOp = function(opData) {
  return !opData.op && !opData.create && !opData.del;
}

// Transform server op data by a client op, and vice versa. Ops are edited in place.
Doc.prototype._xf = function(client, server) {
  // In this case, we're in for some fun. There are some local operations
  // which are totally invalid - either the client continued editing a
  // document that someone else deleted or a document was created both on the
  // client and on the server. In either case, the local document is way
  // invalid and the client's ops are useless.
  //
  // The client becomes a no-op, and we keep the server op entirely.
  if (server.create || server.del) return setNoOp(client);
  if (client.create) throw new Error('Invalid state. This is a bug.');

  // The client has deleted the document while the server edited it. Kill the
  // server's op.
  if (client.del) return setNoOp(server);

  // We only get here if either the server or client ops are no-op. Carry on,
  // nothing to see here.
  if (!server.op || !client.op) return;

  // They both edited the document. This is the normal case for this function -
  // as in, most of the time we'll end up down here.
  //
  // You should be wondering why I'm using client.type instead of this.type.
  // The reason is, if we get ops at an old version of the document, this.type
  // might be undefined or a totally different type. By pinning the type to the
  // op data, we make sure the right type has its transform function called.
  if (client.type.transformX) {
    var result = client.type.transformX(client.op, server.op);
    client.op = result[0];
    server.op = result[1];
  } else {
    client.op = client.type.transform(client.op, server.op, 'left');
    server.op = client.type.transform(server.op, client.op, 'right');
  }
};

// Internal method to actually apply the given op data to our local model.
//
// _afterOtApply() should always be called synchronously afterwards.
Doc.prototype._otApply = function(opData, context) {
  // Lock the document. Nobody is allowed to call submitOp() until _afterOtApply is called.
  this.locked = true;

  if (opData.create) {
    // If the type is currently set, it means we tried creating the document
    // and someone else won. client create x server create = server create.
    var create = opData.create;
    this._setType(create.type);
    this.snapshot = this.type.create(create.data);

    // This is a bit heavyweight, but I want the created event to fire outside of the lock.
    this.once('unlocked', function() {
      this.emit('created', context);
    });
  } else if (opData.del) {
    // The type should always exist in this case. del x _ = del
    this._setType(null);
    this.once('unlocked', function() {
      this.emit('deleted', context);
    });
  } else if (opData.op) {
    if (!this.type) throw new Error('Document does not exist');

    var type = this.type;

    var op = opData.op;
    this.emit('before op', op, context);

    // This exists so clients can pull any necessary data out of the snapshot
    // before it gets changed.  Previously we kept the old snapshot object and
    // passed it to the op event handler. However, apply no longer guarantees
    // the old object is still valid.
    //
    // Because this could be totally unnecessary work, its behind a flag. set
    // doc.incremental to enable.
    if (this.incremental && type.incrementalApply) {
      var _this = this;
      type.incrementalApply(this.snapshot, op, function(o, snapshot) {
        _this.snapshot = snapshot;
        _this.emit('op', o, context);
      });
    } else {
      // This is the most common case, simply applying the operation to the local snapshot.
      this.snapshot = type.apply(this.snapshot, op);
      this.emit('op', op, context);
    }
  }
  // Its possible for none of the above cases to match, in which case the op is
  // a no-op. This will happen when a document has been deleted locally and
  // remote ops edit the document.
};

// This should be called right after _otApply.
Doc.prototype._afterOtApply = function(opData, context) {
  this.locked = false;
  this.emit('unlocked');
  if (opData.op) {
    var contexts = this.editingContexts;
    if (contexts) {
      // Notify all the contexts about the op (well, all the contexts except
      // the one which initiated the submit in the first place).
      for (var i = 0; i < contexts.length; i++) {
        var c = contexts[i];
        if (context != c && c._onOp) c._onOp(opData.op);
      }
      for (var i = 0; i < contexts.length; i++) {
        if (contexts.remove) contexts.splice(i--, 1);
      }
    }

    return this.emit('after op', opData.op, context);
  }
};

// Internal method to actually send op data to the server.
Doc.prototype._sendOpData = function(d) {
  if (this.state === 'subscribing' || this.state === 'unsubscribing')
    throw new Error('invalid state for sendOpData');

  var msg = {a: 'op', v: this.version};
  if (d.src) {
    msg.src = d.src;
    msg.seq = d.seq;
  }

  if (this.state === 'unsubscribed') msg.f = true; // fetch intermediate ops

  if (d.op) msg.op = d.op;
  if (d.create) msg.create = d.create;
  if (d.del) msg.del = d.del;


  this._send(msg);
  
  // The first time we send an op, its id and sequence number is implicit.
  if (!d.src) {
    d.src = this.connection.id;
    d.seq = this.connection.seq++;
  }
};

// Try to compose data2 into data1. Returns truthy if it succeeds, otherwise falsy.
var _tryCompose = function(type, data1, data2) {
  if (data1.create && data2.del) {
    setNoOp(data1);
  } else if (data1.create && data2.op) {
    // Compose the data into the create data.
    var data = (data1.create.data === undefined) ? type.create() : data1.create.data;
    data1.create.data = type.apply(data, data2.op);
  } else if (isNoOp(data1)) {
    data1.create = data2.create;
    data1.del = data2.del;
    data1.op = data2.op;
  } else if (data1.op && data2.op && type.compose) {
    data1.op = type.compose(data1.op, data2.op);
  } else {
    return false;
  }
  return true;
};

// Internal method called to do the actual work for submitOp(), create() and del(), below.
//
// context is optional.
Doc.prototype._submitOpData = function(opData, context, callback) {
  console.log("version = " + this.version);
  if (typeof context === 'function') {
    callback = context;
    context = true; // The default context is true.
  }
  if (context == null) context = true;

  var error = function(err) {
    if (callback) callback(err);
    else if (console) console.warn('Failed attempt to submitOp:', err);
  };

  if (this.locked) {
    return error("Cannot call submitOp from inside an 'op' event handler");
  }

  // The opData contains either op, create, delete, or none of the above (a no-op).

  if (opData.op) {
    if (!this.type) return error('Document has not been created');

    // Try to normalize the op. This removes trailing skip:0's and things like that.
    if (this.type.normalize) opData.op = this.type.normalize(opData.op);
  }

  // Actually apply the operation locally.
  this._otApply(opData, context);

  // If the type supports composes, try to compose the operation onto the end
  // of the last pending operation.
  var entry = this.pendingData[this.pendingData.length - 1];

  if (this.pendingData.length &&
      (entry = this.pendingData[this.pendingData.length - 1],
       _tryCompose(this.type, entry, opData))) {
  } else {
    entry = opData;
    opData.type = this.type;
    opData.callbacks = [];
    this.pendingData.push(opData);
  }

  if (callback) entry.callbacks.push(callback);

  this._afterOtApply(opData, context);

  var _this = this;
  setTimeout((function() { _this.flush(); }), 0);
};

// Submit an operation to the document. The op must be valid given the current OT type.
Doc.prototype.submitOp = function(op, context, callback) {
  this._submitOpData({op: op}, context, callback);
};

// Create the document, which in ShareJS semantics means to set its type. Every
// object implicitly exists in the database but has no data and no type. Create
// sets the type of the object and can optionally set some initial data on the
// object, depending on the type.
Doc.prototype.create = function(type, data, context, callback) {
  if (typeof data === 'function') {
    // Setting the context to be the callback function in this case so _submitOpData
    // can handle the default value thing.
    context = data;
    data = undefined;
  }
  if (this.type) {
    if (callback) callback('Document already exists');
    return 
  }

  this._submitOpData({create: {type:type, data:data}}, context, callback);
};

// Delete the document. This creates and submits a delete operation to the
// server. Deleting resets the object's type to null and deletes its data. The
// document still exists, and still has the version it used to have before you
// deleted it (well, old version +1).
Doc.prototype.del = function(context, callback) {
  if (!this.type) {
    if (callback) callback('Document does not exist');
    return;
  }

  this._submitOpData({del: true}, context, callback);
};


// This will be called when the server rejects our operations for some reason.
// There's not much we can do here if the OT type is noninvertable, but that
// shouldn't happen too much in real life because readonly documents should be
// flagged as such. (I should probably figure out a flag for that).
//
// This does NOT get called if our op fails to reach the server for some reason
// - we optimistically assume it'll make it there eventually.
Doc.prototype._tryRollback = function(opData) {
  if (opData.create) {
    return this._setType(null);
  } else if (opData.op && opData.type.invert) {
    var undo = opData.type.invert(opData.op);

    // Transform the undo operation by any pending ops.
    for (var i = 0; i < this.pendingData.length; i++) {
      this._xf(this.pendingData[i], undo);
    }

    // ... and apply it locally, reverting the changes.
    // 
    // This operation is applied to look like it comes from a remote context.
    // I'm still not 100% sure about this functionality, because its really a
    // local op. Basically, the problem is that if the client's op is rejected
    // by the server, the editor window should update to reflect the undo.
    this._otApply(undo, false);
    this._afterOtApply(undo, false);
  } else if (opData.op || opData.del) {
    // This is where an undo stack would come in handy.
    this._setType(null);
    this.version = null;
    this.ready = false;
    this.emit('error', "Op apply failed and the operation could not be reverted");

    // Trigger a fetch. In our invalid state, we can't really do anything.
    this.fetch();
  }
};

// This is called when the server acknowledges an operation from the client.
Doc.prototype._opAcknowledged = function(msg) {
  // We've tried to resend an op to the server, which has already been received
  // successfully. Do nothing. The op will be confirmed normally when the op
  // itself is echoed back from the server (handled below).
  if (msg.error === 'Op already submitted') {
    return;
  }

  // Our inflight op has been acknowledged, so we can throw away the inflight data.
  // (We were only holding on to it incase we needed to resend the op.)
  var acknowledgedData = this.inflightData;
  this.inflightData = null;

  if (msg.error) {
    // The server has rejected an op from the client for some reason.
    // We'll send the error message to the user and try to roll back the change.
    this._tryRollback(acknowledgedData);
  } else {
    if (this.ready && msg.v !== this.version) {
      // This should never happen - it means that we've received operations out of order.
      throw new Error('Invalid version from server. Please file an issue, this is a bug.');
    }
    
    // The op was committed successfully. Increment the version number
    this.version++;
    this.emit('acknowledged', acknowledgedData);
  }

  for (var i = 0; i < acknowledgedData.callbacks; i++) {
    acknowledgedData.callbacks[i](msg.error || acknowledgedData.error);
  }

  // Consider sending the next op.
  this.flush();
};


// ***** Message handling

// This is called by the connection when it receives a message for the document.
Doc.prototype._onMessage = function(msg) {
  if (!(msg.c === this.collection && msg.doc === this.name)) {
    // This should never happen - its a sanity check for bugs in the connection code.
    throw new Error("Got message for wrong document.");
  }

  // msg.a = the action.
  switch (msg.a) {
    case 'data':
      // This will happen when we request a fetch or a fetch & subscribe.
      //
      // _injestData will emit a 'ready' event, which is usually what you want to listen to.
      this._injestData(msg);
      this.emit('fetched', this.snapshot);
      break;

    case 'sub':
      // Subscribe reply.
      if (msg.error) {
        if (console) console.error("Could not subscribe: " + msg.error);
        this.emit('error', msg.error);
        this.wantSubscribe = false;
        this.state = 'unsubscribed';
      } else {
        this.state = 'subscribed';
      }
      // Should I really emit a 'subscribed' error if we couldn't subscribe?
      this.emit('subscribed', msg.error);
      this.flush();
      break;

    case 'unsub':
      // Unsubscribe reply
      this.state = 'unsubscribed';
      this.emit('unsubscribed');
      this.flush();
      break;

    case 'ack':
      // Acknowledge a locally submitted operation.
      //
      // I'm not happy with the way this logic (and the logic in the op
      // handler, below) currently works. Its because the server doesn't
      // currently guarantee any particular ordering of op ack & oplog messages.
      if (msg.error) this._opAcknowledged(msg);
      break;

    case 'op':
      console.log("version = " + this.version);
      if (this.inflightData &&
          msg.src === this.inflightData.src &&
          msg.seq === this.inflightData.seq) {
        // This one is mine. Accept it as acknowledged.
        this._opAcknowledged(msg);
        break;
      }

      if (msg.v !== this.version) {
        this.emit('error', "Expected version " + this.version + " but got " + msg.v);
        break;
      }

      if (this.inflightData) this._xf(this.inflightData, msg);

      for (var i = 0; i < this.pendingData.length; i++) {
        this._xf(this.pendingData[i], msg);
      }

      this.version++;
      this._otApply(msg, false);
      this._afterOtApply(msg, false);
      break;

    case 'meta':
      if (console) console.warn('Unhandled meta op:', msg);
      break;

    default:
      if (console) console.warn('Unhandled document message:', msg);
      break;
  }
};

// Send the next pending op to the server, if we can.
//
// Only one operation can be in-flight at a time. If an operation is already on
// its way, or we're not currently connected, this method does nothing.
Doc.prototype.flush = function() {
  if (!this.connection.canSend || this.inflightData) return;

  // First consider changing state
  if (this.state === 'subscribed' && !this.wantSubscribe) {
    this.state = 'unsubscribing';
    this._send({a:'unsub'});
  } else if (this.state === 'unsubscribed' && this.wantSubscribe) {
    this.state = 'subscribing'
    this._send(this.ready ? {a:'sub', v:this.version} : {a:'sub'});
  } else {
    // Try and send any pending ops.

    // First pump and dump any no-ops from the front of the pending op list.
    var opData;
    while (this.pendingData.length && isNoOp(opData = this.pendingData.shift())) {
      var callbacks = opData.callbacks;
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](opData.error);
      }
      opData = null;
    }

    // No ops to send after all.
    if (!opData) return;

    this.inflightData = opData;

    // Delay for debugging.
    var that = this;
    setTimeout(function() { that._sendOpData(opData); }, 1000);
  }
};

// Get and return the current document snapshot.
Doc.prototype.getSnapshot = function() {
  return this.snapshot;
};

MicroEvent.mixin(Doc);

// A Connection wraps a persistant BC connection to a sharejs server.
//
// This class implements the client side of the protocol defined here:
// https://github.com/josephg/ShareJS/wiki/Wire-Protocol
//
// The equivalent server code is in src/server/session.
//
// This file is a bit of a mess. I'm dreadfully sorry about that. It passes all the tests,
// so I have hope that its *correct* even if its not clean.
//
// To make a connection, use:
//  new sharejs.Connection(socket)
//
// The socket should look like a websocket connection. It should have the following properties:
//  send(msg): Send the given message. msg may be an object - if so, you might need to JSON.stringify it.
//  close(): Disconnect the session
//
//  onmessage = function(msg){}: Event handler which is called whenever a message is received. The message
//     passed in should already be an object. (It may need to be JSON.parsed)
//  onclose
//  onerror
//  onopen
//  onconnecting
//
// The socket should probably automatically reconnect. If so, it should emit the appropriate events as it
// disconnects & reconnects. (onclose(), onconnecting(), onopen()).

var types, Doc;
if (typeof require !== 'undefined') {
  types = require('ot-types');
  Doc = require('./doc').Doc;
  Query = require('./query').Query;
} else {
  types = window.ottypes;
  Doc = exports.Doc;
}

var Connection = exports.Connection = function (socket) {
  this.socket = socket;

  // Map of collection -> docName -> doc object for created documents.
  // (created documents MUST BE UNIQUE)
  this.collections = {};

  // Each query is created with an id that the server uses when it sends us
  // info about the query (updates, etc).
  this.nextQueryId = 1;
  // Map from query ID -> query object.
  this.queries = {};

  // Connection state.
  // 
  // States:
  // - 'connecting': The connection has been established, but we don't have our client ID yet
  // - 'connected': We have connected and recieved our client ID. Ready for data.
  // - 'disconnected': The connection is closed, but it will reconnect automatically.
  // - 'stopped': The connection is closed, and should not reconnect.
  this.state = 'disconnected';

  // This is a helper variable the document uses to see whether we're currently
  // in a 'live' state. It is true if the state is 'connecting' or 'connected'.
  this.canSend = false;

  // Reset some more state variables.
  this.reset();


  var _this = this;

  // Attach event handlers to the socket.
  socket.onmessage = function(msg) {
    console.log('RECV', msg);

    // Switch on the message action. Most messages are for documents and are
    // handled in the doc class.
    switch (msg.a) {
      case 'init':
        // Client initialization packet. This bundle of joy contains our client
        // ID.
        if (msg.protocol !== 0) throw new Error('Invalid protocol version');
        if (typeof msg.id != 'string') throw new Error('Invalid client id');

        _this.id = msg.id;
        _this._setState('connected');
        break;

      case 'qsub':
      case 'q':
      case 'qunsub':
        // Query message. Pass this to the appropriate query object.
        _this.queries[msg.id]._onMessage(msg);
        break;

      default:
        // Document message. Pull out the referenced document and forward the
        // message.
        var collection, docName, doc;
        if (msg.doc) {
          collection = this._lastReceivedCollection = msg.c;
          docName = this._lastReceivedDoc = msg.doc;
        } else {
          collection = msg.c = this._lastReceivedCollection;
          docName = msg.doc = this._lastReceivedDoc;
        }

        doc = _this.get(collection, docName);
        if (!doc) {
          if (console) console.error('Message for unknown doc. Ignoring.', msg);
          break;
        }
        doc._onMessage(msg);
    }
  };

  socket.onopen = function() {
    _this._setState('connecting');
  };

  socket.onerror = function(e) {
    _this.emit('error', e);
  };

  socket.onclose = function(reason) {
    _this._setState('disconnected', reason);
    if (reason === 'Closed' || reason === 'Stopped by server') {
      _this._setState('stopped', reason);
    }
  };
}

/* Why does this function exist? Is it important?
Connection.prototype._error = function(e) {
  this._setState('stopped', e);
  return this.disconnect(e);
};
*/

Connection.prototype.reset = function() {
  this.id = this.lastError =
    this._lastReceivedCollection = this._lastReceivedDoc =
    this._lastSentCollection = this._lastSentDoc = null;

  this.seq = 1;
};

// Set the connection's state. The connection is basically a state machine.
Connection.prototype._setState = function(newState, data) {
  if (this.state === newState) return;

  // I made a state diagram. The only invalid transitions are getting to
  // 'connecting' from anywhere other than 'disconnected' and getting to
  // 'connected' from anywhere other than 'connecting'.
  if ((newState === 'connecting' && this.state !== 'disconnected')
      || (newState === 'connected' && this.state !== 'connecting')) {
    throw new Error("Cannot transition directly from " + this.state + " to " + newState);
  }

  this.state = newState;
  this.canSend = newState === 'connecting' || newState === 'connected';

  if (newState === 'disconnected') this.reset();

  this.emit(newState, data);

  // & Emit the event to all documents & queries. It might make sense for
  // documents to just register for this stuff using events, but that couples
  // connections and documents a bit much. Its not a big deal either way.
  for (c in this.collections) {
    var collection = this.collections[c];
    for (docName in collection) {
      collection[docName]._onConnectionStateChanged(newState, data);
    }
  }
  for (c in this.queries) {
    this.queries[c]._onConnectionStateChanged(newState, data);
  }
};

// Send a message to the connection.
Connection.prototype.send = function(data) {
  console.log("SEND:", data);

  if (data.doc) { // Not set for queries.
    var docName = data.doc;
    var collection = data.c;
    if (collection === this._lastSentCollection && docName === this._lastSentDoc) {
      delete data.c;
      delete data.doc;
    } else {
      this._lastSentCollection = collection;
      this._lastSentDoc = docName;
    }
  }

  this.socket.send(data);
};

Connection.prototype.disconnect = function() {
  // This will call @socket.onclose(), which in turn will emit the 'disconnected' event.
  this.socket.close();
};


// ***** Document management

Connection.prototype.get = function(collection, name) {
  if (this.collections[collection]) return this.collections[collection][name];
};

// Create a document if it doesn't exist. Returns the document synchronously.
Connection.prototype.getOrCreate = function(collection, name, data) {
  var doc = this.get(collection, name);
  if (doc) return doc;

  // Create it.
  doc = new Doc(this, collection, name, data);

  collection = this.collections[collection] = (this.collections[collection] || {});
  return collection[name] = doc;
};


// **** Queries.

/**
 *
 * @optional source
 */
Connection.prototype.createQuery = function(collection, q, source) {
  var id = this.nextQueryId++;
  var query = new Query(this, id, collection, q);
  this.queries[id] = query;
  return query;
};

Connection.prototype.destroyQuery = function(query) {
  delete this.queries[query.id];
};

if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Connection);

/* This contains the textarea binding for ShareJS. This binding is really
 * simple, and a bit slow on big documents (Its O(N). However, it requires no
 * changes to the DOM and no heavy libraries like ace. It works for any kind of
 * text input field.
 *
 * You probably want to use this binding for small fields on forms and such.
 * For code editors or rich text editors or whatever, I recommend something
 * heavier.
 */


/* applyChange creates the edits to convert oldval -> newval.
 *
 * This function should be called every time the text element is changed.
 * Because changes are always localised, the diffing is quite easy. We simply
 * scan in from the start and scan in from the end to isolate the edited range,
 * then delete everything that was removed & add everything that was added.
 * This wouldn't work for complex changes, but this function should be called
 * on keystroke - so the edits will mostly just be single character changes.
 * Sometimes they'll paste text over other text, but even then the diff
 * generated by this algorithm is correct.
 *
 * This algorithm is O(N). I suspect you could speed it up somehow using regular expressions.
 */
var applyChange = function(ctx, oldval, newval) {
  // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
  if (oldval === newval) return;

  var commonStart = 0;
  while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
    commonStart++;
  }

  var commonEnd = 0;
  while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
      commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
    commonEnd++;
  }

  if (oldval.length !== commonStart + commonEnd) {
    ctx.remove(commonStart, oldval.length - commonStart - commonEnd);
  }
  if (newval.length !== commonStart + commonEnd) {
    ctx.insert(commonStart, newval.slice(commonStart, newval.length - commonEnd));
  }
};

// Attach a textarea to a document's editing context.
//
// The context is optional, and will be created from the document if its not
// specified.
window.sharejs.Doc.prototype.attachTextarea = function(elem, ctx) {
  if (!ctx) ctx = this.createContext();

  if (!ctx.provides.text) throw new Error('Cannot attach to non-text document');

  elem.value = ctx.getText();

  // The current value of the element's text is stored so we can quickly check
  // if its been changed in the event handlers. This is mostly for browsers on
  // windows, where the content contains \r\n newlines. applyChange() is only
  // called after the \r\n newlines are converted, and that check is quite
  // slow. So we also cache the string before conversion so we can do a quick
  // check incase the conversion isn't needed.
  var prevvalue;

  // Replace the content of the text area with newText, and transform the
  // current cursor by the specified function.
  var replaceText = function(newText, transformCursor) {
    if (transformCursor) {
      var newSelection = [transformCursor(elem.selectionStart), transformCursor(elem.selectionEnd)];
    }

    // Fixate the window's scroll while we set the element's value. Otherwise
    // the browser scrolls to the element.
    var scrollTop = elem.scrollTop;
    elem.value = newText;
    prevvalue = elem.value; // Not done on one line so the browser can do newline conversion.
    if (elem.scrollTop !== scrollTop) elem.scrollTop = scrollTop;

    // Setting the selection moves the cursor. We'll just have to let your
    // cursor drift if the element isn't active, though usually users don't
    // care.
    if (newSelection && window.document.activeElement === elem) {
      elem.selectionStart = newSelection[0];
      elem.selectionEnd = newSelection[1];
    }
  };

  replaceText(ctx.getText());


  // *** remote -> local changes

  ctx.onInsert = function(pos, text) {
    var transformCursor = function(cursor) {
      return pos < cursor ? cursor + text.length : cursor;
    };

    // Remove any window-style newline characters. Windows inserts these, and
    // they mess up the generated diff.
    var prev = elem.value.replace(/\r\n/g, '\n');
    replaceText(prev.slice(0, pos) + text + prev.slice(pos), transformCursor);
  };

  ctx.onRemove = function(pos, length) {
    var transformCursor = function(cursor) {
      // If the cursor is inside the deleted region, we only want to move back to the start
      // of the region. Hence the Math.min.
      return pos < cursor ? cursor - Math.min(length, cursor - pos) : cursor;
    };

    var prev = elem.value.replace(/\r\n/g, '\n');
    replaceText(prev.slice(0, pos) + prev.slice(pos + length), transformCursor);
  };


  // *** local -> remote changes

  // This function generates operations from the changed content in the textarea.
  var genOp = function(event) {
    // In a timeout so the browser has time to propogate the event's changes to the DOM.
    setTimeout(function() {
      if (elem.value !== prevvalue) {
        prevvalue = elem.value;
        applyChange(ctx, ctx.getText(), elem.value.replace(/\r\n/g, '\n'));
      }
    }, 0);
  };

  var eventNames = ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste'];
  for (var i = 0; i < eventNames.length; i++) {
    var e = eventNames[i];
    if (elem.addEventListener) {
      elem.addEventListener(e, genOp, false);
    } else {
      elem.attachEvent('on' + e, genOp);
    }
  }

  ctx.detach = function() {
    for (var i = 0; i < eventNames.length; i++) {
      var e = eventNames[i];
      if (elem.removeEventListener) {
        elem.removeEventListener(e, genOp, false);
      } else {
        elem.detachEvent('on' + e, genOp);
      }
    }
  };

  return ctx;
};

// Queries are live requests to the database for particular sets of fields.
//
// The server actively tells the client when there's new data that matches
// a set of conditions.
var Query = exports.Query = function(connection, id, collection, query) {
  this.connection = connection;

  this.id = id;
  this.collection = collection;

  // The query itself. For mongo, this should look something like {"data.x":5}
  this.query = query;

  // A list of resulting documents. These are actual documents, complete with
  // data and all the rest. If autoFetch is false, these documents will not
  // have any data. You should manually call fetch() or subscribe() on them.
  //
  // Calling subscribe() might be a good idea anyway, as you won't be
  // subscribed to the documents by default.
  this.results = [];
  
  // Do we ask the server to give us snapshots of the documents with the query
  // results?
  this.autoFetch = false;

  // Should we automatically resubscribe on reconnect? This is set when you
  // subscribe and unsubscribe.
  this.autoSubscribe = false;

  // Do we have some initial data?
  this.ready = false;
}

// Like the equivalent in the Doc class, this calls the specified function once
// the query has data.
Query.prototype.whenReady = function(fn) {
  if (this.ready) {
    fn();
  } else {
    this.once('ready', fn);
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if (msg.error) return this.emit('error', msg.error);

  if (msg.data) {
    // This message replaces the entire result set with the set passed.

    // First go through our current data set and remove everything.
    for (var i = 0; i < this.results.length; i++) {
      this.emit('removed', this.results[i], 0);
    }

    this.results.length = 0;

    // Then add everything in the new result set.
    for (var i = 0; i < msg.data.length; i++) {
      var docData = msg.data[i];
      var doc = this.connection.getOrCreate(this.collection, docData.docName, docData);
      this.results.push(doc);
      this.emit('added', doc, i);
    }

    if (!this.ready) {
      this.ready = true;
      this.emit('ready', this.results);
    }
  } else if (msg.add) {
    // Just splice in one element to the list.
    var data = msg.add;
    var doc = this.connection.getOrCreate(this.collection, data.docName, data);
    this.results.splice(msg.idx, 0, doc);
    this.emit('added', doc, msg.idx);

  } else if (msg.rm) {
    // Remove one.
    this.emit('removed', this.results[msg.idx], msg.idx);
    this.results.splice(msg.idx, 1);
  }
};

// Subscribe to the query. This means we get the query data + updates. Do not
// call subscribe multiple times. Once subscribe is called, the query will
// automatically be resubscribed after the client reconnects.
Query.prototype.subscribe = function() {
  this.autoSubscribe = true;

  if (this.connection.canSend) {
    this.connection.send({
      a: 'qsub',
      c: this.collection,
      o: {f:this.autoFetch, p:this.poll},
      id: this.id,
      q: this.query
    });
  }
};

// Unsubscribe from the query.
Query.prototype.unsubscribe = function() {
  this.autoSubscribe = false;

  if (this.connection.canSend) {
    this.connection.send({
      a: 'qunsub',
      id: this.id
    });
  }
};

// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  this.connection.destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting' && this.autoSubscribe)
    this.subscribe();
};

var MicroEvent;
if (typeof require !== 'undefined') {
  MicroEvent = require('./microevent');
}

MicroEvent.mixin(Query);

// Generated by CoffeeScript 1.6.1
var SubDoc, depath, extendDoc, pathEquals, traverse, _type, _types,
  __slice = [].slice;

_types = typeof window === 'undefined' ? require('ot-types') : window.ottypes;

if (typeof WEB !== "undefined" && WEB !== null) {
  extendDoc = exports.extendDoc;
  exports.extendDoc = function(name, fn) {
    SubDoc.prototype[name] = fn;
    return extendDoc(name, fn);
  };
}

depath = function(path) {
  if (path.length === 1 && path[0].constructor === Array) {
    return path[0];
  } else {
    return path;
  }
};

SubDoc = (function() {

  function SubDoc(doc, path) {
    this.doc = doc;
    this.path = path;
  }

  SubDoc.prototype.at = function() {
    var path;
    path = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return this.doc.at(this.path.concat(depath(path)));
  };

  SubDoc.prototype.parent = function() {
    if (this.path.length) {
      return this.doc.at(this.path.slice(0, this.path.length - 1));
    } else {
      return void 0;
    }
  };

  SubDoc.prototype.get = function() {
    return this.doc.getAt(this.path);
  };

  SubDoc.prototype.set = function(value, cb) {
    return this.doc.setAt(this.path, value, cb);
  };

  SubDoc.prototype.insert = function(pos, value, cb) {
    return this.doc.insertAt(this.path, pos, value, cb);
  };

  SubDoc.prototype.del = function(pos, length, cb) {
    return this.doc.deleteTextAt(this.path, length, pos, cb);
  };

  SubDoc.prototype.remove = function(cb) {
    return this.doc.removeAt(this.path, cb);
  };

  SubDoc.prototype.push = function(value, cb) {
    return this.insert(this.get().length, value, cb);
  };

  SubDoc.prototype.move = function(from, to, cb) {
    return this.doc.moveAt(this.path, from, to, cb);
  };

  SubDoc.prototype.add = function(amount, cb) {
    return this.doc.addAt(this.path, amount, cb);
  };

  SubDoc.prototype.on = function(event, cb) {
    return this.doc.addListener(this.path, event, cb);
  };

  SubDoc.prototype.removeListener = function(l) {
    return this.doc.removeListener(l);
  };

  SubDoc.prototype.getLength = function() {
    return this.get().length;
  };

  SubDoc.prototype.getText = function() {
    return this.get();
  };

  return SubDoc;

})();

traverse = function(snapshot, path) {
  var container, elem, key, p, _i, _len;
  container = {
    data: snapshot
  };
  key = 'data';
  elem = container;
  for (_i = 0, _len = path.length; _i < _len; _i++) {
    p = path[_i];
    elem = elem[key];
    key = p;
    if (typeof elem === 'undefined') {
      throw new Error('bad path');
    }
  }
  return {
    elem: elem,
    key: key
  };
};

pathEquals = function(p1, p2) {
  var e, i, _i, _len;
  if (p1.length !== p2.length) {
    return false;
  }
  for (i = _i = 0, _len = p1.length; _i < _len; i = ++_i) {
    e = p1[i];
    if (e !== p2[i]) {
      return false;
    }
  }
  return true;
};

_type = _types['http://sharejs.org/types/JSONv0'];

_type.api = {
  provides: {
    json: true
  },
  _fixComponentPaths: function(c) {
    var dummy, i, l, to_remove, xformed, _i, _j, _len, _len1, _ref, _results;
    if (!this._listeners) {
      return;
    }
    if (c.na !== void 0 || c.si !== void 0 || c.sd !== void 0) {
      return;
    }
    to_remove = [];
    _ref = this._listeners;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      l = _ref[i];
      dummy = {
        p: l.path,
        na: 0
      };
      xformed = _type.transformComponent([], dummy, c, 'left');
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
    _results = [];
    for (_j = 0, _len1 = to_remove.length; _j < _len1; _j++) {
      i = to_remove[_j];
      _results.push(this._listeners.splice(i, 1));
    }
    return _results;
  },
  _fixPaths: function(op) {
    var c, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = op.length; _i < _len; _i++) {
      c = op[_i];
      _results.push(this._fixComponentPaths(c));
    }
    return _results;
  },
  _submit: function(op, callback) {
    this._fixPaths(op);
    return this.submitOp(op, callback);
  },
  at: function() {
    var path;
    path = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    return new SubDoc(this, depath(path));
  },
  get: function() {
    return this.snapshot;
  },
  set: function(value, cb) {
    return this.setAt([], value, cb);
  },
  getAt: function(path) {
    var elem, key, _ref;
    _ref = traverse(this.snapshot, path), elem = _ref.elem, key = _ref.key;
    return elem[key];
  },
  setAt: function(path, value, cb) {
    var elem, key, op, _ref;
    _ref = traverse(this.snapshot, path), elem = _ref.elem, key = _ref.key;
    op = {
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
  },
  removeAt: function(path, cb) {
    var elem, key, op, _ref;
    _ref = traverse(this.snapshot, path), elem = _ref.elem, key = _ref.key;
    if (typeof elem[key] === 'undefined') {
      throw new Error('no element at that path');
    }
    op = {
      p: path
    };
    if (elem.constructor === Array) {
      op.ld = elem[key];
    } else if (typeof elem === 'object') {
      op.od = elem[key];
    } else {
      throw new Error('bad path');
    }
    return this._submit([op], cb);
  },
  insertAt: function(path, pos, value, cb) {
    var elem, key, op, _ref;
    _ref = traverse(this.snapshot, path), elem = _ref.elem, key = _ref.key;
    op = {
      p: path.concat(pos)
    };
    if (elem[key].constructor === Array) {
      op.li = value;
    } else if (typeof elem[key] === 'string') {
      op.si = value;
    }
    return this._submit([op], cb);
  },
  moveAt: function(path, from, to, cb) {
    var op;
    op = [
      {
        p: path.concat(from),
        lm: to
      }
    ];
    return this._submit(op, cb);
  },
  addAt: function(path, amount, cb) {
    var op;
    op = [
      {
        p: path,
        na: amount
      }
    ];
    return this._submit(op, cb);
  },
  deleteTextAt: function(path, length, pos, cb) {
    var elem, key, op, _ref;
    _ref = traverse(this.snapshot, path), elem = _ref.elem, key = _ref.key;
    op = [
      {
        p: path.concat(pos),
        sd: elem[key].slice(pos, pos + length)
      }
    ];
    return this._submit(op, cb);
  },
  addListener: function(path, event, cb) {
    var l;
    this._listeners || (this._listeners = []);
    l = {
      path: path,
      event: event,
      cb: cb
    };
    this._listeners.push(l);
    return l;
  },
  removeListener: function(l) {
    var i;
    if (!this._listeners) {
      return;
    }
    i = this._listeners.indexOf(l);
    if (i < 0) {
      return false;
    }
    this._listeners.splice(i, 1);
    return true;
  },
  _onOp: function(op) {
    var c, cb, child_path, event, match_path, path, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = op.length; _i < _len; _i++) {
      c = op[_i];
      this._fixComponentPaths(c);
      match_path = c.na === void 0 ? c.p.slice(0, c.p.length - 1) : c.p;
      _results.push((function() {
        var _j, _len1, _ref, _ref1, _results1;
        _ref = this._listeners;
        _results1 = [];
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          _ref1 = _ref[_j], path = _ref1.path, event = _ref1.event, cb = _ref1.cb;
          if (pathEquals(path, match_path)) {
            switch (event) {
              case 'insert':
                if (c.li !== void 0 && c.ld === void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.li));
                } else if (c.oi !== void 0 && c.od === void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.oi));
                } else if (c.si !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.si));
                } else {
                  _results1.push(void 0);
                }
                break;
              case 'delete':
                if (c.li === void 0 && c.ld !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.ld));
                } else if (c.oi === void 0 && c.od !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.od));
                } else if (c.sd !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.sd));
                } else {
                  _results1.push(void 0);
                }
                break;
              case 'replace':
                if (c.li !== void 0 && c.ld !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.ld, c.li));
                } else if (c.oi !== void 0 && c.od !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.od, c.oi));
                } else {
                  _results1.push(void 0);
                }
                break;
              case 'move':
                if (c.lm !== void 0) {
                  _results1.push(cb(c.p[c.p.length - 1], c.lm));
                } else {
                  _results1.push(void 0);
                }
                break;
              case 'add':
                if (c.na !== void 0) {
                  _results1.push(cb(c.na));
                } else {
                  _results1.push(void 0);
                }
                break;
              default:
                _results1.push(void 0);
            }
          } else if (_type.canOpAffectOp(path, match_path)) {
            if (event === 'child op') {
              child_path = c.p.slice(path.length);
              _results1.push(cb(child_path, c));
            } else {
              _results1.push(void 0);
            }
          } else {
            _results1.push(void 0);
          }
        }
        return _results1;
      }).call(this));
    }
    return _results;
  }
};
})();
