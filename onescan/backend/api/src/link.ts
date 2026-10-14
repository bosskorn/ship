import { html, json } from './http';
import type { Env } from './env';

/**
 * Email-link landing page (`/auth/link`) on the verified App Links host. On a phone with OneScan,
 * Android opens the app directly (App Links) and this page is never shown. It appears only when
 * the link is opened elsewhere (a computer, a browser without the app): it says where to open it
 * and never hands the token to a custom scheme (M1). The token stays in the URL fragment, which
 * browsers do not send to this server.
 */
export function linkPage(): Response {
  return html(`<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OneScan</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1F2633;--mute:#5A6273;--brand:#0052D9}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#E8EAEE;--mute:#A3A9B5;--brand:#5B93FF}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,Roboto,"Noto Sans Thai",sans-serif;
padding:48px max(20px,env(safe-area-inset-left)) 32px max(20px,env(safe-area-inset-right));text-align:center}
.w{font-size:26px;font-weight:700}.w b{color:var(--brand)}p{color:var(--mute);max-width:420px;margin:12px auto}
</style></head><body>
<div class="w">One<b>Scan</b></div>
<p>เปิดลิงก์นี้บนโทรศัพท์ Android ที่ติดตั้ง OneScan แล้ว ระบบจะเปิดแอปให้โดยอัตโนมัติ</p>
<p>Open this link on the Android phone where OneScan is installed. It opens in the app automatically.</p>
<p style="font-size:13px">ลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 1 ชั่วโมง · Links work once and expire within 1 hour.</p>
<script>history.replaceState(null, '', location.pathname);</script>
</body></html>`);
}

/**
 * Where HTML cannot be served: redirect to the app. The URL fragment (the one-time data) is not
 * sent to this server, and browsers carry it over to a Location that has none (RFC 9110 §10.2.2).
 */
export function linkRedirect(): Response {
  return new Response(null, { status: 302, headers: { location: 'onescan://auth/callback', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

/** Digital Asset Links for Android App Links (verified https links open OneScan directly). */
export function assetLinks(env: Env): Response {
  const certs = (env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.ANDROID_PACKAGE || !certs.length) return json([]);
  return json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE, sha256_cert_fingerprints: certs },
    },
  ]);
}
