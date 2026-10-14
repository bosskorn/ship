#!/usr/bin/env node
/**
 * Checks Android App Links for OneScan account emails (security review M1).
 *
 *   node scripts/verify-app-links.mjs <host> [--apk path/to.apk] [--cert AA:BB:...]...
 *
 * - https://<host>/.well-known/assetlinks.json: 200, no redirect, JSON, package
 *   app.onescan.mobile, handle_all_urls, every --cert fingerprint listed
 * - Google's Digital Asset Links API sees the same statement (what Android verifies against)
 * - https://<host>/auth/link answers (fallback page when a link is opened off-device)
 * - --apk: the APK declares an autoVerify https intent filter for <host>/auth/link and is
 *   signed by a certificate listed in assetlinks.json (needs Android build-tools on PATH or ANDROID_HOME)
 * Exit code 0 = all checks passed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = 'app.onescan.mobile';
const args = process.argv.slice(2);
const host = args[0];
if (!host || host.startsWith('-')) {
  console.error('usage: node scripts/verify-app-links.mjs <host> [--apk file] [--cert SHA256]...');
  process.exit(2);
}
const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const certs = opt('--cert').map((c) => c.toUpperCase());
const apk = opt('--apk')[0];
let failed = 0;
const ok = (msg) => console.log(`PASS  ${msg}`);
const bad = (msg) => {
  failed += 1;
  console.log(`FAIL  ${msg}`);
};

function buildTool(name) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '/root/android-sdk';
  const dir = join(sdk, 'build-tools');
  if (!existsSync(dir)) return name;
  const v = readdirSync(dir).sort().pop();
  return join(dir, v, name);
}

// 1. assetlinks.json
let listed = [];
try {
  const res = await fetch(`https://${host}/.well-known/assetlinks.json`, { redirect: 'manual' });
  if (res.status !== 200) bad(`assetlinks.json status ${res.status} (must be 200 without redirects)`);
  else {
    ok('assetlinks.json is served over HTTPS with status 200');
    const type = res.headers.get('content-type') ?? '';
    (type.includes('application/json') ? ok : bad)(`content-type ${type}`);
    const json = await res.json();
    const st = Array.isArray(json) ? json.find((s) => s?.target?.package_name === PACKAGE) : null;
    if (!st) bad(`no statement for ${PACKAGE}`);
    else {
      ok(`statement for ${PACKAGE}`);
      (st.relation?.includes('delegate_permission/common.handle_all_urls') ? ok : bad)('relation handle_all_urls');
      listed = (st.target.sha256_cert_fingerprints ?? []).map((c) => String(c).toUpperCase());
      for (const c of certs) (listed.includes(c) ? ok : bad)(`fingerprint listed: ${c}`);
      if (!listed.length) bad('no sha256_cert_fingerprints');
    }
  }
} catch (e) {
  bad(`assetlinks.json not reachable: ${e.message}`);
}

// 2. Google's view (Android verifies with the same statements)
try {
  const q = new URLSearchParams({ 'source.web.site': `https://${host}`, relation: 'delegate_permission/common.handle_all_urls' });
  const res = await fetch(`https://digitalassetlinks.googleapis.com/v1/statements:list?${q}`);
  const json = await res.json();
  const targets = (json.statements ?? []).filter((s) => s.target?.androidApp?.packageName === PACKAGE);
  (targets.length ? ok : bad)(`Google Digital Asset Links API lists ${PACKAGE} (${targets.length} statement(s))`);
} catch (e) {
  bad(`Digital Asset Links API: ${e.message}`);
}

// 3. Fallback page
try {
  const res = await fetch(`https://${host}/auth/link`, { redirect: 'manual' });
  (res.status === 200 ? ok : bad)(`https://${host}/auth/link status ${res.status}`);
} catch (e) {
  bad(`/auth/link not reachable: ${e.message}`);
}

// 4. The APK
if (apk) {
  try {
    const xml = execFileSync(buildTool('aapt2'), ['dump', 'xmltree', apk, '--file', 'AndroidManifest.xml'], { encoding: 'utf8' });
    const filters = xml.split(/E: intent-filter/).slice(1);
    const verified = filters.some((f) => /autoVerify[^\n]*=true|autoVerify[^\n]*0xffffffff/.test(f) && f.includes(`"${host}"`) && /"https"/.test(f) && f.includes('/auth/link'));
    (verified ? ok : bad)(`APK declares autoVerify https://${host}/auth/link`);
    const pkg = /package="([^"]+)"/.exec(xml)?.[1];
    (pkg === PACKAGE ? ok : bad)(`APK package ${pkg}`);
    const signer = execFileSync(buildTool('apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' });
    const sha = /SHA-256 digest: ([0-9a-f]+)/i.exec(signer)?.[1]?.toUpperCase().match(/../g)?.join(':');
    (sha && listed.includes(sha) ? ok : bad)(`APK signer ${sha} is listed in assetlinks.json`);
  } catch (e) {
    bad(`APK check: ${e.message}`);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll App Links checks passed');
process.exit(failed ? 1 : 0);
