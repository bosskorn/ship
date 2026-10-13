/**
 * Documents stay on the device: no Android Auto Backup, no cloud backup or
 * device-to-device transfer of app data (Android 12+ data extraction rules).
 * Runs after expo-secure-store's plugin and replaces its backup attributes.
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULES = 'onescan_data_extraction_rules';
const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];
const section = (tag) => `  <${tag}>\n${DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n')}\n  </${tag}>`;
const XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- OneScan: nothing leaves the device through backup or device transfer. -->
<data-extraction-rules>
${section('cloud-backup')}
${section('device-transfer')}
</data-extraction-rules>
`;

module.exports = function withPrivacyHardening(config) {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = 'false';
    app.$['android:dataExtractionRules'] = `@xml/${RULES}`;
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${RULES}.xml`), XML);
      return c;
    },
  ]);
};
