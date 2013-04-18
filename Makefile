.PHONY: all test clean webclient

COFFEE = node_modules/.bin/coffee
UGLIFY = node_modules/.bin/uglifyjs

CLIENT = \
	web-prelude.coffee \
	microevent.coffee \
	doc.coffee \
	connection.coffee \
	index.coffee \
	textarea.coffee

CLIENT_EXTRA = \
	node_modules/ot-types/webclient/text.js \
	node_modules/ot-types/webclient/json0.js

CLIENT_SRCS = $(addprefix src/client/, $(CLIENT)) $(CLIENT_EXTRA)

all: webclient

clean:
	rm -rf lib
	rm -rf webclient

test:
	node_modules/.bin/mocha

webclient/share.uncompressed.js: $(CLIENT_SRCS)
	coffee -j $@ -c $(filter %.coffee,$^)
	cat $(filter %.js,$^) >> $@

# Uglify.
webclient/%.js: webclient/%.uncompressed.js
	$(UGLIFY) $< -cmo $@

# Compile the types for a browser.
webclient: webclient/share.js

