# MIT License:
#
# Copyright (c) 2010-2012, Joe Walnes
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

###
This behaves like a WebSocket in every way, except if it fails to connect,
or it gets disconnected, it will repeatedly poll until it succesfully connects
again.

It is API compatible, so when you have:
ws = new WebSocket('ws://....');
you can replace with:
ws = new ReconnectingWebSocket('ws://....');

The event stream will typically look like:
onopen
onmessage
onmessage
onclose // lost connection
onopen  // sometime later...
onmessage
onmessage
etc...

It is API compatible with the standard WebSocket API.

Inspired from: https://github.com/joewalnes/reconnecting-websocket/
Contributors:
- Joe Walnes
- Didier Colens
- Wout Mertens
###
class ReconnectingWebSocket
  constructor: (url, protocols, Socket) ->
    if protocols? and typeof protocols is 'function'
      Socket = protocols
      protocols = undefined
    else if typeof Socket isnt 'function'
      Socket = WebSocket

    # These can be altered by calling code.
    @debug = @debugAll
    @reconnectInterval = 1000
    @timeoutInterval = 2000

    @forcedClose = false

    @url = url
    @protocols = protocols
    @readyState = Socket.CONNECTING
    @URL = url # Public API
  
    timedOut = false
    connect = (reconnectAttempt) =>
      @ws = new Socket(@url)
      console.debug "ReconnectingWebSocket", "attempt-connect", @url  if @debug

      timeout = setTimeout(=>
        console.debug "ReconnectingWebSocket", "connection-timeout", @url  if @debug
        timedOut = true
        @ws.close()
        timedOut = false
      , @timeoutInterval)

      @ws.onopen = (event) =>
        clearTimeout timeout
        console.debug "ReconnectingWebSocket", "onopen", @url  if @debug
        @readyState = Socket.OPEN
        reconnectAttempt = false
        @onopen event

      @ws.onclose = (event) =>
        clearTimeout timeout
        @ws = null
        if @forcedClose
          @readyState = Socket.CLOSED
          @onclose event
        else
          @readyState = Socket.CONNECTING
          @onconnecting event
          if not reconnectAttempt and not timedOut
            console.debug "ReconnectingWebSocket", "onclose", @url  if @debug
            @onclose event
          setTimeout (-> connect true ), @reconnectInterval

      @ws.onmessage = (event) =>
        console.debug "ReconnectingWebSocket", "onmessage", @url, event.data  if @debug
        @onmessage event

      @ws.onerror = (event) =>
        console.debug "ReconnectingWebSocket", "onerror", @url, event  if @debug
        @onerror event

    connect @url

  onopen: (event) ->
  onclose: (event) ->
  onconnecting: (event) ->
  onmessage: (event) ->
  onerror: (event) ->

  send: (data) ->
    if @ws
      console.debug "ReconnectingWebSocket", "send", @url, data  if @debug
      @ws.send data
    else
      throw "INVALID_STATE_ERR : Pausing to reconnect websocket"

  close: ->
    if @ws
      @forcedClose = true
      @ws.close()

  ###
  Setting this to true is the equivalent of setting all instances of ReconnectingWebSocket.debug to true.
  ###
  debugAll: false
  ###
  Additional public API method to refresh the connection if still open (close, re-open).
  For example, if the app suspects bad data / missed heart beats, it can try to refresh.
  ###
  refresh: ->
    @ws.close()  if @ws
