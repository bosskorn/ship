// Web preview only: react-native-maps has no web implementation, so swap in a placeholder.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, '../../packages/mobile-ui/src/maps.web.tsx') };
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;
