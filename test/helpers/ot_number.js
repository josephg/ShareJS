/**
 * Simple OT representing a number.
 *
 * Snapshots and operations are just integers. Applying an operation to an
 * integer corresponds to adding the number. It supports inversion.
 *
 * It is used mainly for testing
 */
module.exports = {
  name: 'simple-number',
  uri:  'http://sharejs.org/types/simple-number',

  /**
   * Creates snapshot with initial data
   *
   * @param  {Number} [initial=0]
   * @return {Number}
   */
  create: function(initial) {
    if (initial == null)
      initial = 0;
    return initial;
  },

  /**
   * Apply an operation to a snapshot and return new snapshot.
   */
  apply: function(snapshot, op) {
    return snapshot + op;
  },

  /**
   * Compose operations
   */
  transform: function(op1, op2) {
    return op1 + op2;
  },

  invert: function(operation) {
    return -operation;
  },

  /**
   * Mixin to manipulate snapshots
   *
   * The receiver of this mixin must implement getSnapshot() and
   * submitOp(operation, [callback]).
   */
  api: {
    get: function() { return this.getSnapshot() },
    add: function(value, callback) {
      return this.submitOp(value, callback);
    }
  }
};

