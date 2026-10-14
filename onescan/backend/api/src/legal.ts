import { html } from './http';

/*
 * Terms of Use and Privacy Policy pages opened from the app (register screen, Me).
 * OWNER/LEGAL REVIEW REQUIRED before production: this text describes how OneScan 1.3 actually
 * works, but it is not legal advice and must be approved (PDPA, store policies).
 */

type Lang = 'th' | 'en';

const page = (title: string, body: string, lang: Lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — OneScan</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1F2633;--mute:#5A6273;--line:#E3E6EC;--brand:#0052D9}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#E8EAEE;--mute:#A3A9B5;--line:#2A2E35;--brand:#5B93FF}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 -apple-system,Roboto,"Noto Sans Thai",sans-serif;
padding:24px max(20px,env(safe-area-inset-left)) 48px max(20px,env(safe-area-inset-right))}
main{max-width:680px;margin:auto}h1{font-size:26px;line-height:1.3}h2{font-size:18px;margin-top:28px}
p,li{color:var(--fg)}small{color:var(--mute)}a{color:var(--brand)}
</style></head><body><main>${body}</main></body></html>`;

const TERMS: Record<Lang, string> = {
  th: `<h1>ข้อกำหนดการใช้งาน OneScan</h1><small>มีผล: 2026 · เวอร์ชัน 1.3</small>
<h2>1. บริการ</h2><p>OneScan เป็นแอปสแกนเอกสารที่ทำงานบนอุปกรณ์ของคุณ การสแกน อ่านข้อความ (OCR) ค้นหา และสร้าง PDF ใช้ได้โดยไม่ต้องมีบัญชี บัญชี OneScan เป็นทางเลือก</p>
<h2>2. บัญชี</h2><p>คุณต้องให้อีเมลที่เป็นของคุณ เก็บรหัสผ่านเป็นความลับ และรับผิดชอบการใช้งานบัญชีของคุณ คุณออกจากระบบหรือลบบัญชีได้ทุกเมื่อในแอป (ฉัน → บัญชี OneScan)</p>
<h2>3. เอกสารของคุณ</h2><p>เอกสารที่สแกนเป็นของคุณ เก็บและเข้ารหัสบนอุปกรณ์ การเข้าสู่ระบบไม่อัปโหลดเอกสาร การออกจากระบบหรือลบบัญชีไม่ลบเอกสารบนอุปกรณ์</p>
<h2>4. การใช้งานที่ไม่อนุญาต</h2><p>ห้ามใช้บริการเพื่อกระทำผิดกฎหมาย โจมตีหรือรบกวนระบบ หรือเข้าถึงบัญชีของผู้อื่น</p>
<h2>5. การเปลี่ยนแปลงและการยุติ</h2><p>เราอาจปรับปรุงบริการหรือข้อกำหนดนี้ โดยจะแจ้งการเปลี่ยนแปลงที่สำคัญในแอป เราอาจระงับบัญชีที่ละเมิดข้อกำหนด</p>
<h2>6. ข้อจำกัดความรับผิด</h2><p>บริการให้ตามสภาพ ผลการสแกนและ OCR อาจไม่สมบูรณ์ โปรดตรวจเอกสารสำคัญก่อนใช้งาน</p>`,
  en: `<h1>OneScan Terms of Use</h1><small>Effective 2026 · version 1.3</small>
<h2>1. The service</h2><p>OneScan is a document scanner that works on your device. Scanning, text recognition (OCR), search and PDF creation work without an account. A OneScan account is optional.</p>
<h2>2. Your account</h2><p>Use an email address you own, keep your password secret, and you are responsible for activity on your account. You can sign out or delete your account at any time in the app (Me → OneScan Account).</p>
<h2>3. Your documents</h2><p>Documents you scan are yours, stored and encrypted on your device. Signing in does not upload them; signing out or deleting your account does not delete them from your device.</p>
<h2>4. Acceptable use</h2><p>Do not use the service for anything unlawful, to attack or disrupt our systems, or to access other people's accounts.</p>
<h2>5. Changes and termination</h2><p>We may update the service or these terms and will tell you in the app about important changes. We may suspend accounts that break these terms.</p>
<h2>6. Liability</h2><p>The service is provided as is. Scans and OCR may be imperfect; check important documents before relying on them.</p>`,
};

const PRIVACY: Record<Lang, string> = {
  th: `<h1>นโยบายความเป็นส่วนตัว OneScan</h1><small>มีผล: 2026 · เวอร์ชัน 1.3</small>
<h2>เอกสารของคุณ</h2><p>เอกสาร รูป ข้อความ OCR และ PDF เก็บและเข้ารหัสบนอุปกรณ์ของคุณเท่านั้น OneScan ไม่อัปโหลดเอกสารโดยอัตโนมัติ และการเข้าสู่ระบบไม่ส่งเอกสารไปที่เซิร์ฟเวอร์</p>
<h2>ข้อมูลบัญชีที่เราเก็บ</h2><ul><li>อีเมล และสถานะการยืนยันอีเมล</li><li>รหัสผ่าน: จัดการโดยผู้ให้บริการยืนยันตัวตน (Supabase) ในรูปแบบแฮช OneScan ไม่เห็นและไม่เก็บรหัสผ่าน</li>
<li>อุปกรณ์ที่เข้าสู่ระบบ: รุ่นเครื่อง ระบบปฏิบัติการ เวอร์ชันแอป รหัสการติดตั้งแบบสุ่ม เวลาใช้งานล่าสุด</li><li>บันทึกความปลอดภัย เช่น การเข้าสู่ระบบ การออกจากระบบ การรีเซ็ตรหัสผ่าน (ไม่มีรหัสผ่าน โทเคน หรือเนื้อหาเอกสาร)</li></ul>
<h2>วัตถุประสงค์</h2><p>เพื่อให้บริการบัญชี ยืนยันตัวตน แสดงและจัดการอุปกรณ์ที่เข้าสู่ระบบ และรักษาความปลอดภัยของบัญชี</p>
<h2>การเก็บรักษาและการลบ</h2><p>เมื่อคุณขอลบบัญชี ทุกอุปกรณ์จะออกจากระบบทันที และข้อมูลบัญชีจะถูกลบถาวรหลัง 14 วัน (เข้าสู่ระบบภายใน 14 วันเพื่อยกเลิกได้) บันทึกความปลอดภัยเก็บไม่เกิน 12 เดือนในรูปแบบที่ไม่ระบุตัวตน การลบบัญชีไม่ลบเอกสารบนอุปกรณ์</p>
<h2>ผู้ประมวลผลข้อมูล</h2><p>Supabase (ยืนยันตัวตนและฐานข้อมูล, ภูมิภาคสิงคโปร์), Cloudflare (API), ผู้ให้บริการส่งอีเมล</p>
<h2>สิทธิของคุณ</h2><p>คุณขอเข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลได้ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล โดยลบบัญชีได้เองในแอป</p>`,
  en: `<h1>OneScan Privacy Policy</h1><small>Effective 2026 · version 1.3</small>
<h2>Your documents</h2><p>Documents, images, OCR text and PDFs are stored and encrypted on your device only. OneScan never uploads documents automatically, and signing in does not send documents to our servers.</p>
<h2>Account data we keep</h2><ul><li>Your email address and whether it is verified</li><li>Password: handled by our authentication provider (Supabase) as a hash; OneScan never sees or stores it</li>
<li>Signed-in devices: model, operating system, app version, a random installation ID, last active time</li><li>Security events such as sign-in, sign-out and password resets (never passwords, tokens or document content)</li></ul>
<h2>Why</h2><p>To provide the account, verify your identity, show and manage your signed-in devices, and keep your account secure.</p>
<h2>Retention and deletion</h2><p>When you ask to delete your account, every device is signed out at once and your account data is permanently deleted after 14 days (sign in within 14 days to cancel). Security events are kept for at most 12 months in de-identified form. Deleting your account does not delete documents on your device.</p>
<h2>Processors</h2><p>Supabase (authentication and database, Singapore region), Cloudflare (API), our email delivery provider.</p>
<h2>Your rights</h2><p>You can ask to access, correct or delete your personal data under Thailand's PDPA; you can delete your account yourself in the app.</p>`,
};

export function legalPage(which: 'terms' | 'privacy', langParam: string | null): Response {
  const lang: Lang = langParam === 'en' ? 'en' : 'th';
  const body = which === 'terms' ? TERMS[lang] : PRIVACY[lang];
  const title = which === 'terms' ? (lang === 'th' ? 'ข้อกำหนดการใช้งาน' : 'Terms of Use') : lang === 'th' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy';
  return html(page(title, body, lang));
}

/** The same text without markup, for hosts that serve no HTML. */
export function legalText(which: 'terms' | 'privacy', langParam: string | null): Response {
  const lang: Lang = langParam === 'en' ? 'en' : 'th';
  const body = (which === 'terms' ? TERMS[lang] : PRIVACY[lang])
    .replace(/<h1>/g, '')
    .replace(/<h2>/g, '\n\n')
    .replace(/<li>/g, '\n• ')
    .replace(/<\/(h1|small|h2)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return new Response(`${body}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
