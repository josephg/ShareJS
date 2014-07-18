.PHONY: all test clean webclient

COFFEE=node_modules/.bin/coffee
UGLIFY=node_modules/.bin/uglifyjs -d WEB=true

BROWSERIFY=node_modules/.bin/browserify

CLIENT = \
  lib/client/index.js \
  lib/client/types.js \
  lib/client/textarea.js \
  lib/client/doc.js \
  lib/client/query.js \
  lib/client/connection.js \
  node_modules/ot-text/package.json \
  node_modules/ot-json0/package.json \

# not included:	index.coffee 

# Disabled: lib/types/json-api.coffee

CLIENT_SRCS = $(addprefix lib/client/, $(CLIENT))

all: webclient

clean:
	rm -rf webclient/*

webclient/share.uncompressed.js: $(CLIENT)
	mkdir -p webclient
	$(BROWSERIFY) --full-paths -r ./lib/client -s sharejs -o $@

#	echo '(function(){' > $@
#	cat $(filter %.js,$^) >> $@
#	echo '})();' >> $@


# Copy other types from ottypes.
webclient/%.js: node_modules/ottypes/webclient/%.js
	mkdir -p webclient
	cp $< $@

# .. Or uglify the ones we already have.
webclient/%.js: webclient/%.uncompressed.js
	mkdir -p webclient
	$(UGLIFY) $< -c unsafe=true --lint -mo $@

# Compile the types for a browser.
webclient: webclient/share.js webclient/text.js webclient/json0.js

