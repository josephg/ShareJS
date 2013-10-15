// Karma configuration
// Generated on Mon Oct 14 2013 14:42:34 GMT+0200 (CEST)

module.exports = function(config) {
  config.set({

    // base path, that will be used to resolve files and exclude
    basePath: '',

    // frameworks to use
    frameworks: ['mocha', 'browserify'],

    // list of files / patterns to load in the browser
    files: [
      'test/browser/*.coffee'
    ],

    preprocessors: {
      '**/*.coffee': ['coffee'],
      'test/browser/*': ['browserify']
    },

    // Configure browserify
    browserify: {
      extension: ['.coffee'],  // This is for future compatibility.
      transform: ['coffeeify'],
      watch: true // Watches dependencies only (Karma watches the tests)
    },

    // test results reporter to use
    // possible values: 'dots', 'progress', 'junit', 'growl', 'coverage'
    reporters: ['progress'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // Start these browsers, currently available:
    // - Chrome
    // - ChromeCanary
    // - Firefox
    // - Opera
    // - Safari (only Mac)
    // - PhantomJS
    // - IE (only Windows)
    browsers: ['Chrome'],

    proxies: {
      '/channel': 'http://localhost:3000/channel',
      '/fixtures': 'http://localhost:3000/fixtures'
    },

    // If browser does not capture in given timeout [ms], kill it
    captureTimeout: 60000,


    // Continuous Integration mode
    // if true, it capture browsers, run tests and exit
    singleRun: false
  });
};
