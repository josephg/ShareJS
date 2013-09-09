# This is an implementation of the OT data backend for MySQL. It requires
# that you have two tables defined in your schema: one for the snapshots
# and one for the operations. You must also install the 'mysql' package.
#
#
# Example usage:
#
#     var connect = require('connect');
#     var share   = require('share').server;
#
#     var server = connect(connect.logger());
#
#     var options = {
#       db: {
#         type: 'mysql',
#         host     : 'example.org',
#         user     : 'bob',
#         password : 'secret',
#         create_tables_automatically: true
#       }
#     };
#
#     share.attach(server, options);
#     server.listen(9000);
#
# You can run bin/setup_pg to create the SQL tables initially.

mysql = require('mysql')

defaultOptions =
  schema: 'sharejs'
  uri: null                         # An optional uri for connection
  create_tables_automatically: true
  operations_table: 'ops'
  snapshot_table: 'snapshots'

module.exports = MysqlDb = (options) ->
  return new Db if !(this instanceof MysqlDb)

  options ?= {}
  options[k] ?= v for k, v of defaultOptions

  client = options.client or mysql.createConnection options
  client.connect()

  snapshot_table = options.schema and "#{options.schema}.#{options.snapshot_table}" or options.snapshot_table
  operations_table = options.schema and "#{options.schema}.#{options.operations_table}" or options.operations_table

  @close = ->
    client.end()

  @initialize = (callback) ->
    console.warn 'Creating mysql database tables'

    sql = """
     CREATE SCHEMA #{options.schema};
    """
    client.query sql, (error, result) ->
      error?.message

    sql =  """
      CREATE TABLE #{snapshot_table} (
        doc varchar(256) NOT NULL,
        v int NOT NULL,
        type varchar(256) NOT NULL,
        snapshot text NOT NULL,
        meta text NOT NULL,
        created_at timestamp NOT NULL,
        CONSTRAINT snapshots_pkey PRIMARY KEY (doc, v)
      );
    """
    client.query sql, (error, result) ->
      error?.message

    sql = """
      CREATE TABLE #{operations_table} (
        doc varchar(256) NOT NULL,
        v int NOT NULL,
        op text NOT NULL,
        meta text NOT NULL,
        CONSTRAINT operations_pkey PRIMARY KEY (doc, v)
      );
    """
    client.query sql, (error, result) ->
      callback? error?.message

  # This will perminantly delete all data in the database.
  @dropTables = (callback) ->
    sql = "DROP SCHEMA #{options.schema} CASCADE;"
    client.query sql, (error, result) ->
      callback? error.message

  @create = (docName, docData, callback) ->
    sql = """
      INSERT INTO #{snapshot_table} SET ?
    """
    values =
      doc:        docName,
      v:          docData.v
      snapshot:   JSON.stringify(docData.snapshot),
      meta:       JSON.stringify(docData.meta),
      type:       docData.type,
      created_at: new Date
    client.query sql, values, (error, result) ->
      if !error?
        callback?()
      else if error.toString().match "duplicate key value violates unique constraint"
        callback? "Document already exists"
      else
        callback? error?.message

  @delete = (docName, dbMeta, callback) ->
    sql = """
      DELETE FROM #{operations_table}
      WHERE doc = ?
    """
    values = [docName]
    client.query sql, values, (error, result) ->
      if !error?
        sql = """
          DELETE FROM #{snapshot_table}
          WHERE doc = ?
        """
        client.query sql, values, (error, result) ->
          if !error? and result.length > 0
            callback?()
          else if !error?
            callback? "Document does not exist"
          else
            callback? error?.message
      else
        callback? error?.message

  @getSnapshot = (docName, callback) ->
    sql = """
      SELECT *
      FROM #{snapshot_table}
      WHERE doc = ?
      ORDER BY v DESC
      LIMIT 1
    """
    values = [docName]
    client.query sql, values, (error, result) ->
      if !error? and result.length > 0
        row = result[0]
        data =
          v:        row.v
          snapshot: JSON.parse(row.snapshot)
          meta:     JSON.parse(row.meta)
          type:     row.type
        callback? null, data
      else if !error?
        callback? "Document does not exist"
      else
        callback? error?.message

  @writeSnapshot = (docName, docData, dbMeta, callback) ->
    sql = """
      UPDATE #{snapshot_table}
      SET ?
      WHERE doc = ?
    """
    values =
      v:        docData.v
      snapshot: JSON.stringify(docData.snapshot)
      meta:     JSON.stringify(docData.meta)
    client.query sql, [values, docName], (error, result) ->
      if !error?
        callback?()
      else
        callback? error?.message

  @getOps = (docName, start, end, callback) ->
    end = if end? then end - 1 else 2147483647
    sql = """
      SELECT *
      FROM #{operations_table}
      WHERE v BETWEEN ? AND ?
      AND doc = ?
      ORDER BY v ASC
    """
    values = [start, end, docName]
    client.query sql, values, (error, result) ->
      if !error?
        data = result.map (row) ->
          return {
            op:   JSON.parse row.op
            # v:    row.version
            meta: JSON.parse row.meta
          }
        callback? null, data
      else
        callback? error?.message

  @writeOp = (docName, opData, callback) ->
    sql = """
      INSERT INTO #{operations_table} SET ?
    """
    values =
      doc:  docName
      op:   JSON.stringify(opData.op)
      v:    opData.v
      meta: JSON.stringify(opData.meta)
    client.query sql, values, (error, result) ->
      if !error?
        callback?()
      else
        callback? error?.message

  # Immediately try and create the database tables if need be. Its possible that a query
  # which happens immediately will happen before the database has been initialized.
  #
  # But, its not really a big problem.
  if options.create_tables_automatically
    client.query "SELECT * from #{snapshot_table} LIMIT 0", (error, result) =>
      @initialize() if error?.message.match "(does not exist|ER_NO_SUCH_TABLE)"

  this
