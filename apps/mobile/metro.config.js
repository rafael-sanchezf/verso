// Metro, with the styling layer wired in.
//
// Uniwind compiles Tailwind v4 classes at build time, so it works through
// Metro rather than Babel and its wrapper has to be the outermost one.
// `cssEntryFile` is also what tells Tailwind where the app root is: it scans
// for class names from that file's directory down.

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
