.PHONY: all test clean webclient

UGLIFY = node_modules/.bin/uglifyjs -d WEB=true
BROWSERIFY = node_modules/.bin/browserify

all: build minify

build:
	mkdir -p dist
	$(BROWSERIFY) -s sharejs lib/client/index.js -o dist/share.js

minify:
	$(UGLIFY) -cm --lint dist/share.js > dist/share.min.js

clean:
	rm -rf dist/*
