.PHONY: all test clean webclient

COFFEE = node_modules/.bin/coffee
UGLIFY = node_modules/.bin/uglifyjs -d WEB=true

CLIENT = \
	web-prelude.js \
	microevent.js \
	doc.js \
	connection.js \
	textarea.coffee

# not included:	index.coffee 

BUNDLED_TYPES = \
	node_modules/ot-types/webclient/text.js \
	src/types/text-api.js \
#	node_modules/ot-types/webclient/json0.js

CLIENT_SRCS = $(addprefix src/client/, $(CLIENT))

all: webclient

clean:
	rm -rf lib
	rm -rf webclient

test:
	node_modules/.bin/mocha

webclient/share.uncompressed.js: $(BUNDLED_TYPES) $(CLIENT_SRCS)
	mkdir -p webclient
	echo '(function(){' > $@
	cat $(filter %.js,$^) >> $@
	$(foreach SRC, $(filter %.coffee,$^), coffee -bpc $(SRC) >> $@;)
	echo '})();' >> $@


# Uglify.
webclient/%.js: webclient/%.uncompressed.js
	$(UGLIFY) $< -cmo $@

# Compile the types for a browser.
webclient: webclient/share.js
	cp node_modules/ot-types/webclient/text.js webclient/
	cp node_modules/ot-types/webclient/json0.js webclient/
	cp node_modules/ot-types/webclient/json0.uncompressed.js webclient/

