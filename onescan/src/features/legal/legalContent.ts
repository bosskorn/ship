import type { IconName } from '@/design-system';

/*
 * Privacy Policy and Terms of Use, shown inside the app (Me → About, account screens).
 * Describes what OneScan 1.3 actually does. OWNER / LEGAL REVIEW REQUIRED before production
 * (PDPA, Google Play policy); keep the web copy in backend/api/src/legal.ts in step with this.
 */

export type LegalDoc = 'privacy' | 'terms';
export type LegalLang = 'th' | 'en';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Short closing line under the bullets. */
  note?: string;
}

export interface LegalDocument {
  title: string;
  updated: string;
  version: string;
  intro: string;
  /** Key points shown first, before the full text. */
  highlights?: { icon: IconName; title: string; body: string }[];
  sections: LegalSection[];
}

const PRIVACY_TH: LegalDocument = {
  title: 'นโยบายความเป็นส่วนตัว',
  updated: 'ปรับปรุงล่าสุด 14 ตุลาคม 2569',
  version: 'เวอร์ชัน 1.3',
  intro:
    'OneScan ออกแบบให้เอกสารของคุณอยู่บนโทรศัพท์ของคุณ นโยบายนี้อธิบายว่าเราประมวลผลข้อมูลอะไร เพื่ออะไร และคุณควบคุมข้อมูลของคุณได้อย่างไร',
  highlights: [
    { icon: 'lock', title: 'เอกสารอยู่ในเครื่องและเข้ารหัส', body: 'รูป ข้อความ OCR และ PDF ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ของเรา' },
    { icon: 'profile', title: 'บัญชีเป็นทางเลือก', body: 'สแกน อ่านข้อความ ค้นหา และสร้าง PDF ได้โดยไม่ต้องสมัคร' },
    { icon: 'shield', title: 'ไม่มีโฆษณา ไม่ขายข้อมูล', body: 'ไม่มีตัวติดตามโฆษณา และไม่เก็บสถิติการใช้งาน' },
    { icon: 'delete', title: 'ลบบัญชีได้เองในแอป', body: 'ข้อมูลบัญชีถูกลบภายใน 14 วัน เอกสารในเครื่องไม่ถูกลบ' },
  ],
  sections: [
    {
      title: 'เอกสารและรูปที่คุณสแกน',
      paragraphs: [
        'การสแกน การปรับภาพ การอ่านข้อความ (OCR) การค้นหา และการสร้าง PDF ทำงานบนอุปกรณ์ทั้งหมด เอกสารถูกเก็บในพื้นที่ของแอปและเข้ารหัสด้วย AES-256 โดยกุญแจอยู่ใน Android Keystore ของเครื่อง',
        'OneScan ไม่อัปโหลดเอกสารโดยอัตโนมัติ การเข้าสู่ระบบไม่ได้ส่งเอกสารไปที่ใด เอกสารออกจากเครื่องเฉพาะเมื่อคุณเลือกแชร์หรือส่งออกเอง',
        'แอปปิดการสำรองข้อมูลอัตโนมัติของ Android เพื่อไม่ให้สำเนาเอกสารไปอยู่ในระบบสำรองข้อมูลภายนอก หากถอนการติดตั้งแอป เอกสารในเครื่องจะถูกลบไปด้วย',
      ],
    },
    {
      title: 'สิทธิ์ที่แอปขอ',
      bullets: [
        'กล้อง: ใช้ถ่ายเอกสารเท่านั้น ภาพไม่ถูกบันทึกหรือส่งออกโดยที่คุณไม่ได้กดบันทึก',
        'รูปภาพและไฟล์: เฉพาะไฟล์ที่คุณเลือกนำเข้า',
        'อินเทอร์เน็ต: ใช้เฉพาะบริการบัญชี OneScan (ถ้าคุณใช้) และการตั้งค่าของแอป',
      ],
      note: 'เมื่อใช้ตัวสแกนเอกสารของระบบ (Google) การประมวลผลเกิดบนอุปกรณ์ผ่าน Google Play services ภายใต้นโยบายของ Google',
    },
    {
      title: 'ข้อมูลบัญชี OneScan (เมื่อคุณสมัคร)',
      bullets: [
        'อีเมล และสถานะการยืนยันอีเมล',
        'รหัสผ่าน: จัดการโดยผู้ให้บริการยืนยันตัวตนในรูปแบบแฮช OneScan ไม่เห็นและไม่เก็บรหัสผ่านของคุณ',
        'อุปกรณ์ที่เข้าสู่ระบบ: รุ่นเครื่อง ระบบปฏิบัติการ เวอร์ชันแอป รหัสการติดตั้งแบบสุ่ม และเวลาใช้งานล่าสุด',
        'บันทึกความปลอดภัย เช่น การเข้าสู่ระบบ ออกจากระบบ และการรีเซ็ตรหัสผ่าน โดยไม่มีรหัสผ่าน โทเคน หรือเนื้อหาเอกสาร',
      ],
    },
    {
      title: 'วัตถุประสงค์และฐานทางกฎหมาย',
      paragraphs: [
        'เราใช้ข้อมูลบัญชีเพื่อให้บริการบัญชีตามที่คุณขอ (ฐานสัญญา) ได้แก่ ยืนยันตัวตน แสดงและจัดการอุปกรณ์ที่เข้าสู่ระบบ และรักษาความปลอดภัยของบัญชี (ฐานประโยชน์โดยชอบด้วยกฎหมาย) เราไม่ใช้ข้อมูลเพื่อโฆษณาและไม่ขายข้อมูลให้ผู้ใด',
      ],
    },
    {
      title: 'ผู้ประมวลผลข้อมูล',
      bullets: [
        'Supabase: ระบบยืนยันตัวตน ฐานข้อมูล และ API ของบัญชี (ศูนย์ข้อมูลในภูมิภาคเอเชียแปซิฟิก)',
        'ผู้ให้บริการส่งอีเมล: ส่งอีเมลยืนยันและอีเมลรีเซ็ตรหัสผ่าน',
      ],
      note: 'ผู้ประมวลผลเข้าถึงข้อมูลได้เท่าที่จำเป็นต่อการให้บริการเท่านั้น',
    },
    {
      title: 'การเก็บรักษาและการลบ',
      bullets: [
        'ข้อมูลบัญชีเก็บไว้ตราบที่คุณมีบัญชี',
        'เมื่อขอลบบัญชี ทุกอุปกรณ์ออกจากระบบทันที และข้อมูลบัญชีถูกลบถาวรหลัง 14 วัน (เข้าสู่ระบบภายใน 14 วันเพื่อยกเลิกได้)',
        'บันทึกความปลอดภัยเก็บไม่เกิน 12 เดือน และหลังลบบัญชีจะเหลือในรูปแบบที่ระบุตัวตนไม่ได้',
        'การออกจากระบบหรือลบบัญชีไม่ลบเอกสารในเครื่องของคุณ',
      ],
    },
    {
      title: 'ความปลอดภัย',
      paragraphs: [
        'การเชื่อมต่อทั้งหมดใช้ HTTPS โทเคนการเข้าสู่ระบบเก็บในที่เก็บข้อมูลที่ปลอดภัยของเครื่อง เซสชันหมดอายุเมื่อไม่ใช้งาน 30 วัน และอายุสูงสุด 90 วัน คุณดูและออกจากระบบอุปกรณ์อื่นได้ในเมนู อุปกรณ์และเซสชัน',
      ],
    },
    {
      title: 'สิทธิของคุณ',
      paragraphs: [
        'ภายใต้พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 คุณมีสิทธิขอเข้าถึง ขอสำเนา แก้ไข ลบ คัดค้าน หรือจำกัดการประมวลผลข้อมูลส่วนบุคคล ขอโอนย้ายข้อมูล และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล คุณลบบัญชีได้เองในแอปที่ ฉัน → บัญชี OneScan',
      ],
    },
    {
      title: 'เด็ก',
      paragraphs: ['บริการบัญชีไม่ได้มุ่งให้บริการแก่ผู้มีอายุต่ำกว่า 13 ปี หากพบว่ามีการสมัครโดยไม่ได้รับความยินยอมที่จำเป็น เราจะลบบัญชีนั้น'],
    },
    {
      title: 'การเปลี่ยนแปลงนโยบาย',
      paragraphs: ['เมื่อมีการเปลี่ยนแปลงที่สำคัญ เราจะแจ้งในแอปก่อนมีผลบังคับใช้ วันที่ปรับปรุงล่าสุดแสดงอยู่ด้านบนของหน้านี้'],
    },
    {
      title: 'ติดต่อเรา',
      paragraphs: ['หากมีคำถามหรือต้องการใช้สิทธิ ติดต่อผู้พัฒนา OneScan ได้ทางอีเมลที่ระบุในหน้าแอป OneScan บน Google Play'],
    },
  ],
};

const PRIVACY_EN: LegalDocument = {
  title: 'Privacy Policy',
  updated: 'Last updated 14 October 2026',
  version: 'Version 1.3',
  intro:
    'OneScan is built so that your documents stay on your phone. This policy explains what we process, why, and how you stay in control.',
  highlights: [
    { icon: 'lock', title: 'Documents stay on your device, encrypted', body: 'Images, OCR text and PDFs are never sent to our servers.' },
    { icon: 'profile', title: 'An account is optional', body: 'Scan, recognise text, search and create PDFs without signing up.' },
    { icon: 'shield', title: 'No ads, no selling data', body: 'No ad trackers and no usage analytics.' },
    { icon: 'delete', title: 'Delete your account in the app', body: 'Account data is deleted within 14 days. Documents on your device are not.' },
  ],
  sections: [
    {
      title: 'Documents and images you scan',
      paragraphs: [
        'Scanning, image enhancement, text recognition (OCR), search and PDF creation all run on your device. Documents are stored in the app’s private storage and encrypted with AES-256, with the key held in your device’s Android Keystore.',
        'OneScan never uploads documents automatically, and signing in does not send documents anywhere. A document leaves your device only when you choose to share or export it.',
        'Android Auto Backup is turned off so copies of your documents do not end up in external backups. Uninstalling the app deletes the documents stored in it.',
      ],
    },
    {
      title: 'Permissions',
      bullets: [
        'Camera: only to capture documents; nothing is kept unless you save it.',
        'Photos and files: only the files you choose to import.',
        'Internet: only for the OneScan account service (if you use it) and app settings.',
      ],
      note: 'When you use the system document scanner (Google), processing happens on your device through Google Play services, under Google’s policies.',
    },
    {
      title: 'OneScan account data (if you sign up)',
      bullets: [
        'Your email address and whether it is verified.',
        'Password: handled by our authentication provider as a hash; OneScan never sees or stores it.',
        'Signed-in devices: model, operating system, app version, a random installation ID and last active time.',
        'Security events such as sign-in, sign-out and password resets — never passwords, tokens or document content.',
      ],
    },
    {
      title: 'Purposes and legal bases',
      paragraphs: [
        'We use account data to provide the account you asked for (contract): verifying your identity, showing and managing signed-in devices, and keeping your account secure (legitimate interests). We do not use data for advertising and we do not sell data.',
      ],
    },
    {
      title: 'Processors',
      bullets: [
        'Supabase: authentication, database and the account API (Asia-Pacific data centres).',
        'Email delivery provider: verification and password-reset emails.',
      ],
      note: 'Processors only access data as needed to provide the service.',
    },
    {
      title: 'Retention and deletion',
      bullets: [
        'Account data is kept while you have an account.',
        'When you delete your account, every device is signed out at once and account data is permanently deleted after 14 days (sign in within 14 days to cancel).',
        'Security events are kept for at most 12 months and, after deletion, only in de-identified form.',
        'Signing out or deleting your account never deletes documents on your device.',
      ],
    },
    {
      title: 'Security',
      paragraphs: [
        'All connections use HTTPS. Sign-in tokens are kept in the device’s secure storage. Sessions end after 30 days without use and after 90 days at most. You can review and sign out other devices under Devices & sessions.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'Under Thailand’s Personal Data Protection Act B.E. 2562 you may request access to, a copy of, correction or deletion of your personal data, object to or restrict processing, request data portability, and complain to the Personal Data Protection Committee. You can delete your account yourself under Me → OneScan Account.',
      ],
    },
    {
      title: 'Children',
      paragraphs: ['The account service is not directed at children under 13. If we learn an account was created without the required consent, we will delete it.'],
    },
    {
      title: 'Changes to this policy',
      paragraphs: ['We will tell you in the app before important changes take effect. The date of the latest update is shown at the top of this page.'],
    },
    {
      title: 'Contact',
      paragraphs: ['For questions or to exercise your rights, contact the OneScan developer at the email address listed on OneScan’s Google Play page.'],
    },
  ],
};

const TERMS_TH: LegalDocument = {
  title: 'ข้อกำหนดการใช้งาน',
  updated: 'ปรับปรุงล่าสุด 14 ตุลาคม 2569',
  version: 'เวอร์ชัน 1.3',
  intro: 'ข้อกำหนดนี้ใช้กับการใช้งานแอป OneScan และบัญชี OneScan การใช้แอปหรือสร้างบัญชีถือว่าคุณยอมรับข้อกำหนดนี้',
  sections: [
    {
      title: 'บริการ',
      paragraphs: [
        'OneScan เป็นแอปสแกนเอกสารที่ทำงานบนอุปกรณ์ของคุณ การสแกน การอ่านข้อความ (OCR) การค้นหา และการสร้าง PDF ใช้ได้โดยไม่ต้องมีบัญชี บัญชี OneScan เป็นทางเลือก',
      ],
    },
    {
      title: 'บัญชีของคุณ',
      bullets: [
        'ใช้อีเมลที่เป็นของคุณและให้ข้อมูลที่ถูกต้อง',
        'เก็บรหัสผ่านเป็นความลับ และแจ้งเราหากสงสัยว่ามีผู้อื่นเข้าถึงบัญชี',
        'คุณรับผิดชอบการใช้งานที่เกิดขึ้นในบัญชีของคุณ',
        'คุณออกจากระบบหรือลบบัญชีได้ทุกเมื่อในแอป',
      ],
    },
    {
      title: 'เอกสารของคุณ',
      paragraphs: [
        'เอกสารที่คุณสแกนเป็นของคุณ และเก็บไว้บนอุปกรณ์ของคุณ เราไม่ได้รับสิทธิใด ๆ ในเนื้อหาเอกสาร คุณควรสำรองเอกสารสำคัญด้วยการส่งออกเป็นประจำ เพราะเอกสารจะหายไปหากอุปกรณ์สูญหาย ถูกล้างข้อมูล หรือถอนการติดตั้งแอป',
      ],
    },
    {
      title: 'การใช้งานที่ไม่อนุญาต',
      bullets: [
        'ใช้บริการเพื่อกระทำผิดกฎหมายหรือละเมิดสิทธิของผู้อื่น',
        'พยายามเข้าถึงบัญชีของผู้อื่น หรือโจมตี รบกวน หรือทดสอบระบบโดยไม่ได้รับอนุญาต',
        'ดัดแปลง แยกส่วน หรือทำวิศวกรรมย้อนกลับแอป เว้นแต่กฎหมายอนุญาต',
      ],
    },
    {
      title: 'การเปลี่ยนแปลงและการยุติ',
      paragraphs: [
        'เราอาจปรับปรุงบริการหรือข้อกำหนดนี้ และจะแจ้งการเปลี่ยนแปลงที่สำคัญในแอป เราอาจระงับบัญชีที่ฝ่าฝืนข้อกำหนด การยุติบัญชีไม่ลบเอกสารบนอุปกรณ์ของคุณ',
      ],
    },
    {
      title: 'ข้อจำกัดความรับผิด',
      paragraphs: [
        'บริการให้ตามสภาพที่เป็น ผลการสแกนและ OCR อาจไม่สมบูรณ์ โปรดตรวจสอบเอกสารสำคัญก่อนนำไปใช้ ภายในขอบเขตที่กฎหมายอนุญาต เราไม่รับผิดต่อความเสียหายทางอ้อมที่เกิดจากการใช้บริการ',
      ],
    },
    {
      title: 'กฎหมายที่ใช้บังคับ',
      paragraphs: ['ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย'],
    },
    {
      title: 'ติดต่อเรา',
      paragraphs: ['ติดต่อผู้พัฒนา OneScan ได้ทางอีเมลที่ระบุในหน้าแอป OneScan บน Google Play'],
    },
  ],
};

const TERMS_EN: LegalDocument = {
  title: 'Terms of Use',
  updated: 'Last updated 14 October 2026',
  version: 'Version 1.3',
  intro: 'These terms apply to the OneScan app and OneScan accounts. By using the app or creating an account you agree to them.',
  sections: [
    {
      title: 'The service',
      paragraphs: [
        'OneScan is a document scanner that works on your device. Scanning, text recognition (OCR), search and PDF creation work without an account. A OneScan account is optional.',
      ],
    },
    {
      title: 'Your account',
      bullets: [
        'Use an email address you own and give accurate information.',
        'Keep your password secret and tell us if you think someone else has accessed your account.',
        'You are responsible for activity on your account.',
        'You can sign out or delete your account at any time in the app.',
      ],
    },
    {
      title: 'Your documents',
      paragraphs: [
        'Documents you scan are yours and are stored on your device. We get no rights to their content. Export important documents regularly as a backup: they are lost if the device is lost or reset, or the app is uninstalled.',
      ],
    },
    {
      title: 'Acceptable use',
      bullets: [
        'Do not use the service for anything unlawful or to infringe others’ rights.',
        'Do not try to access other people’s accounts, or attack, disrupt or probe our systems without permission.',
        'Do not modify, decompile or reverse engineer the app except where the law allows.',
      ],
    },
    {
      title: 'Changes and termination',
      paragraphs: [
        'We may update the service or these terms and will tell you in the app about important changes. We may suspend accounts that break these terms. Ending an account never deletes documents on your device.',
      ],
    },
    {
      title: 'Liability',
      paragraphs: [
        'The service is provided as is. Scans and OCR may be imperfect; check important documents before relying on them. To the extent the law allows, we are not liable for indirect losses arising from use of the service.',
      ],
    },
    {
      title: 'Governing law',
      paragraphs: ['These terms are governed by the laws of Thailand.'],
    },
    {
      title: 'Contact',
      paragraphs: ['Contact the OneScan developer at the email address listed on OneScan’s Google Play page.'],
    },
  ],
};

const DOCS: Record<LegalDoc, Record<LegalLang, LegalDocument>> = {
  privacy: { th: PRIVACY_TH, en: PRIVACY_EN },
  terms: { th: TERMS_TH, en: TERMS_EN },
};

export function legalDocument(doc: LegalDoc, language: string): LegalDocument {
  return DOCS[doc][language.startsWith('th') ? 'th' : 'en'];
}
