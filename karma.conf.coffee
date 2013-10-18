# Karma configuration

module.exports = (config) ->
  config.set

    # base path, that will be used to resolve files and exclude
    basePath: ''

    # frameworks to use
    frameworks: ['mocha', 'browserify']

    # list of files / patterns to load in the browser
    files: [
      'test/browser/*.coffee'
    ]

    preprocessors:
      '**/*.coffee': ['coffee']
      'test/browser/*': ['browserify']

    # Configure browserify
    browserify:
      extension: ['.coffee']  # This is for future compatibility.
      transform: ['coffeeify']
      watch: true # Watches dependencies only (Karma watches the tests)

    # enable / disable watching file and executing tests whenever any file changes
    autoWatch: false

    # Browsers
    browsers: if process.env.TRAVIS then ['Firefox'] else ['Chrome']
