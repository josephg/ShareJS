// Previously this file tried to require all the OT types that were listed in
// the ottypes library. I think its easier to just do this.

// The types register themselves on their respective types.
require('./text-api');
require('./text-tp2-api');

// The JSON API is buggy!! Please submit a pull request fixing it if you want to use it.
//require('./json-api');

