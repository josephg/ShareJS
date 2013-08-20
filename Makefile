.PHONY: all test clean webclient

COFFEE = node_modules/.bin/coffee
UGLIFY = node_modules/.bin/uglifyjs -d WEB=true

CLIENT = \
	web-prelude.js \
	microevent.js \
	doc.js \
	connection.js \
	textarea.js \
	query.js

# not included:	index.coffee 

BUNDLED_TYPES = \
	webclient/text.js \
	lib/types/text-api.js \
	webclient/json0.js \
	lib/types/json-api.js 

# Disabled: lib/types/json-api.coffee

CLIENT_SRCS = $(addprefix lib/client/, $(CLIENT))

all: webclient

clean:
	rm -rf webclient/*

test:
	node_modules/.bin/mocha

webclient/share.uncompressed.js: $(BUNDLED_TYPES) $(CLIENT_SRCS)
	mkdir -p webclient
	echo '(function(){' > $@
	cat $(filter %.js,$^) >> $@
	echo '})();' >> $@


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

