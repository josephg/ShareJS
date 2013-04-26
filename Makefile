.PHONY: all test clean webclient

COFFEE = node_modules/.bin/coffee
UGLIFY = node_modules/.bin/uglifyjs -d WEB=true

CLIENT = \
	web-prelude.js \
	microevent.js \
	doc.js \
	connection.js \
	textarea.js \
	query.coffee

# not included:	index.coffee 

BUNDLED_TYPES = \
	webclient/text.js \
	src/types/text-api.js \
	webclient/json0.js \
	src/types/json-api.coffee

CLIENT_SRCS = $(addprefix src/client/, $(CLIENT))

all: webclient

clean:
	rm -rf lib
	rm -rf webclient/*

test:
	node_modules/.bin/mocha

webclient/share.uncompressed.js: $(BUNDLED_TYPES) $(CLIENT_SRCS)
	echo '(function(){' > $@
	cat $(filter %.js,$^) >> $@
	$(foreach SRC, $(filter %.coffee,$^), coffee -bpc $(SRC) >> $@;)
	echo '})();' >> $@


# Copy other types from ot-types.
webclient/%.js: node_modules/ot-types/webclient/%.js
	cp $< $@

# .. Or uglify the ones we already have.
webclient/%.js: webclient/%.uncompressed.js
	$(UGLIFY) $< -cmo $@

# Compile the types for a browser.
webclient: webclient/share.js webclient/text.js webclient/json0.js

