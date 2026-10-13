/**
 * Release builds are signed with the Play upload key (Play App Signing holds the app
 * signing key). The keystore and passwords never live in the repository: they come from
 * Gradle properties (~/.gradle/gradle.properties) or environment variables
 *   ONESCAN_UPLOAD_STORE_FILE, ONESCAN_UPLOAD_STORE_PASSWORD,
 *   ONESCAN_UPLOAD_KEY_ALIAS, ONESCAN_UPLOAD_KEY_PASSWORD.
 * Without them a release build fails — it is never signed with the debug key.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// onescan-release-signing';
const SIGNING = `
    ${MARK}
    def onescanProp = { String k -> (project.findProperty(k) ?: System.getenv(k))?.toString() }
    def onescanStore = onescanProp('ONESCAN_UPLOAD_STORE_FILE')
    signingConfigs {
        if (onescanStore) {
            release {
                storeFile file(onescanStore)
                storePassword onescanProp('ONESCAN_UPLOAD_STORE_PASSWORD')
                keyAlias onescanProp('ONESCAN_UPLOAD_KEY_ALIAS')
                keyPassword onescanProp('ONESCAN_UPLOAD_KEY_PASSWORD')
            }
        }
    }
    gradle.taskGraph.whenReady { graph ->
        if (!onescanStore && graph.allTasks.any { it.name.toLowerCase().contains('release') && (it.name.startsWith('assemble') || it.name.startsWith('bundle')) }) {
            throw new GradleException('Release signing key not configured (ONESCAN_UPLOAD_STORE_FILE). Refusing to sign a release with the debug key.')
        }
    }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (!g.includes(MARK)) {
      // Our signingConfigs block goes right after `android {`; Gradle merges it with the template's.
      g = g.replace(/android\s*\{/, (m) => `${m}\n${SIGNING}`);
      // Release build type: upload key instead of the template's debug signing.
      g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig onescanStore ? signingConfigs.release : null');
    }
    c.modResults.contents = g;
    return c;
  });
};
