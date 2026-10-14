import { html, json } from './http';
import type { Env } from './env';

/**
 * Email-link bridge (`/auth/link`). Verification and reset emails link here with the one-time
 * token in the URL *fragment*, which browsers never send to the server — so the token is never
 * in a request line or a log. With Android App Links verified, Android opens OneScan directly
 * and this page is never shown; otherwise the page hands the fragment to the app.
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
a.btn{display:inline-block;margin-top:20px;background:var(--brand);color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600}
</style></head><body>
<div class="w">One<b>Scan</b></div>
<p id="m">กำลังเปิด OneScan…<br>Opening OneScan…</p>
<a class="btn" id="open" href="#">เปิดใน OneScan / Open in OneScan</a>
<p style="font-size:13px">ถ้าแอปไม่เปิด ให้เปิดลิงก์นี้บนโทรศัพท์ที่ติดตั้ง OneScan<br>If nothing happens, open this link on the phone where OneScan is installed.</p>
<script>
(function(){
  var p = new URLSearchParams(location.hash.slice(1));
  var t = p.get('token_hash') || '', k = p.get('type') || '';
  var ok = /^[A-Za-z0-9_-]{8,256}$/.test(t) && (k === 'email' || k === 'recovery');
  if (!ok) { document.getElementById('m').textContent = 'ลิงก์ไม่ถูกต้องหรือหมดอายุ / This link is invalid or has expired.'; document.getElementById('open').style.display='none'; return; }
  var q = 'token_hash=' + encodeURIComponent(t) + '&type=' + k;
  var app = /Android/i.test(navigator.userAgent)
    ? 'intent://auth/callback?' + q + '#Intent;scheme=onescan;package=app.onescan.mobile;end'
    : 'onescan://auth/callback?' + q;
  history.replaceState(null, '', location.pathname);
  document.getElementById('open').href = app;
  location.replace(app);
})();
</script></body></html>`);
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
