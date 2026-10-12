// Extends app.json with secrets from the environment (never commit API keys).
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        // iOS uses Apple Maps by default; set this to switch to Google Maps.
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
    ],
  ],
});
