
module.exports = (args...) ->
  # Make SOLR thing.

  name: 'solr'

  submit: (cName, docName, opData, snapshot, callback) ->
    console.log "set snapshot for #{cName} to ", snapshot
    callback()

  
  subscribedChannels: (cName, query, opts) -> ['internet', 'forceSOLR']

  query: (cName, query, callback) ->
    console.log 'running query'
    callback null, results:[], extra:(new Date()).getSeconds()


