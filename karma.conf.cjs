module.exports = (config) => config.set({
  frameworks: ['jasmine'],
  plugins: ['karma-jasmine', 'karma-chrome-launcher', 'karma-coverage'],
  reporters: ['progress'],
  browsers: ['Chrome'],
  // Blender's bridge uses 9876. Bind explicitly so port conflicts fail visibly.
  port: 9877,
  hostname: '127.0.0.1',
  listenAddress: '127.0.0.1',
});
