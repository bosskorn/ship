/* global __dirname */
/**
 * Screenshot harness (not part of `npm test`): renders screens with react-native-web to
 * static HTML for visual review. `node src/__screens__/shoot.js` runs it and captures PNGs.
 */
const path = require('path');
const root = path.join(__dirname, '../..');
const web = require('jest-expo/web/jest-preset.js');
const native = require('jest-expo/jest-preset.js');
const [babelJest, babelOpts] = native.transform['\\.[jt]sx?$'];
const { ['\\.[jt]sx?$']: _js, ...assets } = web.transform;

module.exports = {
  preset: 'jest-expo/web',
  // The web preset's babel-jest has no Expo preset here; reuse the native preset's, for web.
  transform: { ...assets, '\\.[mc]?[jt]sx?$': [babelJest, { ...babelOpts, caller: { ...babelOpts.caller, platform: 'web' } }] },
  // Real icons in the shots: compile the icon library's ES modules too.
  transformIgnorePatterns: web.transformIgnorePatterns.map((p) => p.replace('(.pnpm|', '(.pnpm|lucide-react-native|')),
  rootDir: root,
  roots: ['<rootDir>/src/__screens__'],
  testMatch: ['**/*.shots.tsx'],
  setupFiles: ['<rootDir>/src/__screens__/setup.js'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
