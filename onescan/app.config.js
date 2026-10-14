/**
 * app.json plus build-time settings. EXPO_PUBLIC_APP_LINK_HOST (production) adds a verified
 * Android App Link for https://<host>/auth/link (android:autoVerify): Android checks
 * https://<host>/.well-known/assetlinks.json and opens those links only in OneScan.
 */
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

module.exports = ({ config }) => {
  const host = (process.env.EXPO_PUBLIC_APP_LINK_HOST ?? '').trim().toLowerCase();
  if (!host) return config;
  if (!HOST.test(host)) throw new Error(`EXPO_PUBLIC_APP_LINK_HOST is not a host name: ${host}`);
  return {
    ...config,
    android: {
      ...config.android,
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host, pathPrefix: '/auth/link' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  };
};
