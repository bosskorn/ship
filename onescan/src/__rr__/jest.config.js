/* global __dirname */
/** Receipt Restore R&D harness (not part of `npm test`): runs app code on benchmark images. */
const path = require('path');
module.exports = {
  preset: 'jest-expo',
  rootDir: path.join(__dirname, '../..'),
  roots: ['<rootDir>/src/__rr__'],
  testMatch: ['**/*.rr.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 3600000,
};
