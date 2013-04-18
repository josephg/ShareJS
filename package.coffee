# Package.json file in CoffeeScript
# Nicer to write and you can have comments
# Compile with "cake package"

module.exports =
  name: "share"

  # Change version with "cake [-V newversion] bump"
  version: "0.6.0"
  description: "A database for concurrent document editing"
  keywords: [
  	"operational transformation"
  	"ot"
  	"concurrent"
  	"collaborative"
  	"database"
  	"server"
  ]

  homepage: ""

  author: "Joseph Gentle <josephg@gmail.com>"

  dependencies:
    livedb: "*"
    "ot-types": "*"

    # Prevent upgrades to coffee breaking the build. Bump when tested.
    "coffee-script": "<=1.6"

    # Useragent hashing
    hat: "*"

  # Developer dependencies
  devDependencies:
    shelljs: "*" # Remove this when we move away from Cakefiles.
    # Example server
    express: "~ 3.x"
    optimist: ">= 0.2.4"

    # Transports
    browserchannel: "*"

    # Tests
    mocha: "*"

    # Unixy shell stuff for Cakefile
    shelljs: "*"

    # Javascript compression
    "uglify-js": "~2"

  engine: "node >= 0.6"

  # Main file to execute
  main: "index.js"

  # Binaries to install
  bin:
    sharejs: "bin/sharejs"
    "sharejs-exampleserver": "bin/exampleserver"

  scripts:
    build: "cake build"
    test: "cake test"
    prepublish: "cake webclient"

  licenses: [
    type: "BSD"
    url: "http://www.freebsd.org/copyright/freebsd-license.html"
  ]

  repository:
    type: "git"
    url: "http://github.com/josephg/sharejs.git"
