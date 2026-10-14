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
  intro:
    'ข้อกำหนดการใช้งานฉบับนี้ ("ข้อกำหนด") เป็นข้อตกลงระหว่างคุณกับผู้พัฒนา OneScan ("เรา") ว่าด้วยการใช้แอป OneScan และบัญชี OneScan โปรดอ่านให้ครบถ้วนก่อนใช้งาน',
  highlights: [
    { icon: 'documents', title: 'เอกสารเป็นของคุณ', body: 'เราไม่ได้รับสิทธิใด ๆ ในเนื้อหาเอกสารที่คุณสแกน' },
    { icon: 'profile', title: 'ใช้งานได้โดยไม่ต้องมีบัญชี', body: 'บัญชีเป็นทางเลือก และยกเลิกได้ทุกเมื่อ' },
    { icon: 'check', title: 'ใช้อย่างถูกกฎหมาย', body: 'สแกนเฉพาะเอกสารที่คุณมีสิทธิใช้งาน' },
    { icon: 'storage', title: 'สำรองเอกสารสำคัญเสมอ', body: 'เอกสารอยู่บนเครื่อง หากเครื่องสูญหายหรือลบแอป เอกสารจะหายไปด้วย' },
  ],
  sections: [
    {
      title: 'การยอมรับข้อกำหนด',
      paragraphs: [
        'เมื่อคุณติดตั้ง เปิดใช้ หรือสร้างบัญชี OneScan ถือว่าคุณได้อ่าน เข้าใจ และตกลงผูกพันตามข้อกำหนดนี้และนโยบายความเป็นส่วนตัว หากคุณไม่ยอมรับ โปรดหยุดใช้แอป',
        'หากคุณมีอายุต่ำกว่า 20 ปี (ผู้เยาว์ตามกฎหมายไทย) คุณควรใช้งานโดยได้รับความยินยอมจากผู้ปกครอง และบริการบัญชีไม่เปิดให้ผู้มีอายุต่ำกว่า 13 ปี',
      ],
    },
    {
      title: 'บริการ OneScan',
      paragraphs: [
        'OneScan เป็นแอปสำหรับสแกน จัดเก็บ ค้นหา และส่งออกเอกสาร โดยการสแกน การปรับภาพ การอ่านข้อความ (OCR) และการสร้าง PDF ทำงานบนอุปกรณ์ของคุณ บัญชี OneScan เป็นบริการเสริมที่ไม่จำเป็นต่อการใช้ฟีเจอร์หลัก',
        'เราอาจเพิ่ม ปรับปรุง หรือยุติฟีเจอร์บางส่วนเพื่อพัฒนาบริการ หากเป็นการเปลี่ยนแปลงที่กระทบคุณอย่างมีนัยสำคัญ เราจะแจ้งให้ทราบในแอปล่วงหน้าตามสมควร',
      ],
    },
    {
      title: 'สิทธิการใช้งานแอป',
      paragraphs: [
        'เราให้สิทธิแก่คุณในการใช้แอป OneScan เพื่อวัตถุประสงค์ส่วนตัวหรือการทำงานของคุณเอง แบบไม่ผูกขาด โอนไม่ได้ และเพิกถอนได้ ตามข้อกำหนดนี้ สิทธิใดที่ไม่ได้ระบุไว้อย่างชัดแจ้งยังคงเป็นของเรา',
      ],
    },
    {
      title: 'บัญชี OneScan',
      bullets: [
        'ใช้อีเมลที่เป็นของคุณ และให้ข้อมูลที่ถูกต้องเป็นปัจจุบัน',
        'บัญชีหนึ่งบัญชีสำหรับผู้ใช้หนึ่งคน ห้ามโอน ขาย หรือให้ผู้อื่นใช้บัญชีของคุณ',
        'เก็บรักษารหัสผ่านเป็นความลับ และแจ้งเราทันทีหากสงสัยว่ามีการเข้าถึงโดยไม่ได้รับอนุญาต',
        'คุณรับผิดชอบต่อการกระทำทั้งหมดที่เกิดขึ้นภายใต้บัญชีของคุณ',
        'คุณออกจากระบบ จัดการอุปกรณ์ หรือลบบัญชีได้ด้วยตนเองในแอป',
      ],
    },
    {
      title: 'เอกสารและเนื้อหาของคุณ',
      paragraphs: [
        'คุณเป็นเจ้าของเอกสารและเนื้อหาทั้งหมดที่สแกนหรือนำเข้า เอกสารถูกจัดเก็บและเข้ารหัสบนอุปกรณ์ของคุณ เราไม่ได้รับสิทธิในการเข้าถึง ใช้ หรือเผยแพร่เนื้อหาดังกล่าว',
        'คุณรับรองว่ามีสิทธิโดยชอบในการสแกน จัดเก็บ และแชร์เอกสารที่ใช้กับแอป โดยเฉพาะเอกสารที่มีข้อมูลส่วนบุคคลของผู้อื่น เช่น บัตรประจำตัวประชาชน และจะปฏิบัติตามกฎหมายคุ้มครองข้อมูลส่วนบุคคลที่เกี่ยวข้อง',
        'เนื่องจากเอกสารไม่ได้ถูกสำรองไว้บนเซิร์ฟเวอร์ของเรา คุณควรส่งออกเอกสารสำคัญเก็บไว้เป็นประจำ เราไม่สามารถกู้คืนเอกสารที่สูญหายจากอุปกรณ์ได้',
      ],
    },
    {
      title: 'ความเป็นส่วนตัว',
      paragraphs: ['การเก็บและใช้ข้อมูลส่วนบุคคลเป็นไปตามนโยบายความเป็นส่วนตัวของ OneScan ซึ่งถือเป็นส่วนหนึ่งของข้อกำหนดนี้'],
    },
    {
      title: 'การใช้งานที่ไม่อนุญาต',
      bullets: [
        'ใช้บริการเพื่อกระทำความผิดกฎหมาย ฉ้อโกง ปลอมแปลงเอกสาร หรือละเมิดสิทธิของบุคคลอื่น',
        'สแกนหรือเผยแพร่เอกสารที่คุณไม่มีสิทธิ หรือละเมิดทรัพย์สินทางปัญญาของผู้อื่น',
        'พยายามเข้าถึงบัญชีหรือข้อมูลของผู้อื่น หรือเข้าถึงระบบโดยไม่ได้รับอนุญาต',
        'โจมตี รบกวน ทดสอบช่องโหว่ หรือทำให้ระบบรับภาระเกินสมควร',
        'ดัดแปลง แยกส่วน ทำวิศวกรรมย้อนกลับ หรือสร้างงานดัดแปลงจากแอป เว้นแต่กฎหมายอนุญาต',
        'ใช้โปรแกรมอัตโนมัติเพื่อสร้างบัญชีหรือเรียกใช้บริการบัญชีจำนวนมาก',
      ],
    },
    {
      title: 'ทรัพย์สินทางปัญญา',
      paragraphs: [
        'แอป OneScan ชื่อ โลโก้ การออกแบบ และซอฟต์แวร์เป็นทรัพย์สินของผู้พัฒนาและได้รับความคุ้มครองตามกฎหมาย ซอฟต์แวร์โอเพนซอร์สที่ใช้ในแอปอยู่ภายใต้สัญญาอนุญาตของแต่ละโครงการ',
      ],
    },
    {
      title: 'บริการของบุคคลภายนอก',
      paragraphs: [
        'บางฟีเจอร์อาศัยบริการของบุคคลภายนอก เช่น ตัวสแกนเอกสารของระบบผ่าน Google Play services และผู้ให้บริการยืนยันตัวตนและส่งอีเมลสำหรับบัญชี การใช้บริการเหล่านั้นอาจอยู่ภายใต้ข้อกำหนดของผู้ให้บริการนั้นด้วย',
      ],
    },
    {
      title: 'การระงับและการยุติ',
      paragraphs: [
        'คุณเลิกใช้แอปหรือลบบัญชีได้ทุกเมื่อ เราอาจระงับหรือยุติบัญชีที่ฝ่าฝืนข้อกำหนด เป็นภัยต่อผู้ใช้อื่นหรือระบบ หรือเมื่อกฎหมายกำหนด การยุติบัญชีไม่ลบเอกสารที่อยู่บนอุปกรณ์ของคุณ',
      ],
    },
    {
      title: 'การปฏิเสธการรับประกัน',
      paragraphs: [
        'บริการให้ "ตามสภาพที่เป็น" และ "ตามที่มีให้บริการ" เราไม่รับประกันว่าบริการจะไม่หยุดชะงักหรือปราศจากข้อผิดพลาด และไม่รับประกันความถูกต้องสมบูรณ์ของผลการสแกน การครอบตัด หรือ OCR คุณควรตรวจสอบเอกสารสำคัญก่อนนำไปใช้อ้างอิง',
      ],
    },
    {
      title: 'การจำกัดความรับผิด',
      paragraphs: [
        'ภายในขอบเขตสูงสุดที่กฎหมายอนุญาต เราไม่ต้องรับผิดต่อความเสียหายทางอ้อม ความเสียหายพิเศษ การสูญเสียข้อมูล รายได้ หรือโอกาสทางธุรกิจ ที่เกิดจากการใช้หรือไม่สามารถใช้บริการ ทั้งนี้ ไม่จำกัดความรับผิดที่กฎหมายไม่อนุญาตให้จำกัด รวมถึงสิทธิของผู้บริโภคตามกฎหมายไทย',
      ],
    },
    {
      title: 'การชดใช้ความเสียหาย',
      paragraphs: [
        'คุณตกลงชดใช้ความเสียหายแก่เรา หากมีการเรียกร้องจากบุคคลภายนอกอันเนื่องมาจากการที่คุณฝ่าฝืนข้อกำหนดนี้ หรือใช้บริการกับเอกสารที่คุณไม่มีสิทธิ',
      ],
    },
    {
      title: 'การแก้ไขข้อกำหนด',
      paragraphs: [
        'เราอาจแก้ไขข้อกำหนดนี้เป็นครั้งคราว และจะแจ้งการเปลี่ยนแปลงที่สำคัญในแอปก่อนมีผลบังคับใช้ การใช้งานต่อหลังจากวันที่มีผลถือว่าคุณยอมรับข้อกำหนดฉบับแก้ไข',
      ],
    },
    {
      title: 'กฎหมายที่ใช้บังคับและการระงับข้อพิพาท',
      paragraphs: [
        'ข้อกำหนดนี้อยู่ภายใต้และตีความตามกฎหมายแห่งราชอาณาจักรไทย คู่สัญญาจะพยายามระงับข้อพิพาทโดยการเจรจาก่อน หากไม่สามารถตกลงกันได้ ให้ศาลไทยที่มีเขตอำนาจเป็นผู้พิจารณา',
      ],
    },
    {
      title: 'ข้อกำหนดทั่วไป',
      bullets: [
        'หากข้อใดของข้อกำหนดนี้ไม่มีผลใช้บังคับ ข้ออื่นยังคงมีผลต่อไป',
        'การที่เราไม่ใช้สิทธิตามข้อกำหนดในครั้งใด ไม่ถือเป็นการสละสิทธินั้น',
        'ข้อกำหนดนี้และนโยบายความเป็นส่วนตัวเป็นข้อตกลงทั้งหมดระหว่างคุณกับเราเกี่ยวกับบริการ',
        'หากฉบับภาษาไทยและภาษาอังกฤษขัดแย้งกัน ให้ถือฉบับภาษาไทยเป็นหลัก',
      ],
    },
    {
      title: 'ติดต่อเรา',
      paragraphs: ['หากมีคำถามเกี่ยวกับข้อกำหนดนี้ ติดต่อผู้พัฒนา OneScan ได้ทางอีเมลที่ระบุในหน้าแอป OneScan บน Google Play'],
    },
  ],
};

const TERMS_EN: LegalDocument = {
  title: 'Terms of Use',
  updated: 'Last updated 14 October 2026',
  version: 'Version 1.3',
  intro:
    'These Terms of Use (the "Terms") are an agreement between you and the developer of OneScan ("we", "us") about your use of the OneScan app and OneScan accounts. Please read them carefully.',
  highlights: [
    { icon: 'documents', title: 'Your documents are yours', body: 'We get no rights to the content you scan.' },
    { icon: 'profile', title: 'No account needed', body: 'An account is optional and you can end it at any time.' },
    { icon: 'check', title: 'Use it lawfully', body: 'Only scan documents you are entitled to use.' },
    { icon: 'storage', title: 'Back up what matters', body: 'Documents live on your device; losing the device or the app loses them too.' },
  ],
  sections: [
    {
      title: 'Accepting these Terms',
      paragraphs: [
        'By installing, opening or creating a OneScan account you confirm that you have read, understood and agree to these Terms and our Privacy Policy. If you do not agree, please stop using the app.',
        'If you are under 20 (a minor under Thai law), use OneScan with a parent’s or guardian’s consent. The account service is not available to children under 13.',
      ],
    },
    {
      title: 'The OneScan service',
      paragraphs: [
        'OneScan lets you scan, store, search and export documents. Scanning, image enhancement, text recognition (OCR) and PDF creation run on your device. A OneScan account is an optional extra and is not needed for the core features.',
        'We may add, change or retire features to improve the service. If a change affects you significantly, we will give you reasonable notice in the app.',
      ],
    },
    {
      title: 'Licence to use the app',
      paragraphs: [
        'We grant you a personal, non-exclusive, non-transferable and revocable licence to use OneScan for your own personal or work purposes under these Terms. All rights not expressly granted are reserved.',
      ],
    },
    {
      title: 'Your OneScan account',
      bullets: [
        'Use an email address you own and keep your details accurate.',
        'One account per person; do not transfer, sell or share your account.',
        'Keep your password secret and tell us straight away if you suspect unauthorised access.',
        'You are responsible for all activity under your account.',
        'You can sign out, manage devices or delete your account yourself in the app.',
      ],
    },
    {
      title: 'Your documents and content',
      paragraphs: [
        'You own all documents and content you scan or import. They are stored and encrypted on your device, and we get no right to access, use or publish them.',
        'You confirm you have the right to scan, store and share the documents you use with the app — particularly documents containing other people’s personal data, such as ID cards — and that you will comply with applicable data protection laws.',
        'Because documents are not backed up on our servers, export important documents regularly. We cannot recover documents lost from your device.',
      ],
    },
    {
      title: 'Privacy',
      paragraphs: ['How we collect and use personal data is described in the OneScan Privacy Policy, which forms part of these Terms.'],
    },
    {
      title: 'Acceptable use',
      bullets: [
        'Do not use the service for anything unlawful or fraudulent, to forge documents, or to infringe other people’s rights.',
        'Do not scan or distribute documents you have no right to, or infringe others’ intellectual property.',
        'Do not try to access other people’s accounts or data, or access our systems without permission.',
        'Do not attack, disrupt, probe for vulnerabilities in, or overload our systems.',
        'Do not modify, decompile, reverse engineer or create derivative works of the app, except where the law allows.',
        'Do not use automated means to create accounts or call the account service in bulk.',
      ],
    },
    {
      title: 'Intellectual property',
      paragraphs: [
        'The OneScan app, name, logo, design and software belong to the developer and are protected by law. Open-source components included in the app are licensed under their own terms.',
      ],
    },
    {
      title: 'Third-party services',
      paragraphs: [
        'Some features rely on third parties, such as the system document scanner in Google Play services and the authentication and email providers used for accounts. Their own terms may also apply when you use them.',
      ],
    },
    {
      title: 'Suspension and termination',
      paragraphs: [
        'You may stop using the app or delete your account at any time. We may suspend or end an account that breaks these Terms, puts other users or our systems at risk, or where the law requires. Ending an account never deletes documents on your device.',
      ],
    },
    {
      title: 'Disclaimer of warranties',
      paragraphs: [
        'The service is provided "as is" and "as available". We do not promise that it will be uninterrupted or error-free, or that scans, crops or OCR results will be accurate or complete. Check important documents before relying on them.',
      ],
    },
    {
      title: 'Limitation of liability',
      paragraphs: [
        'To the fullest extent the law allows, we are not liable for indirect, special or consequential losses, or for loss of data, revenue or business opportunity arising from using or being unable to use the service. Nothing here limits liability that cannot be limited by law, including your rights as a consumer under Thai law.',
      ],
    },
    {
      title: 'Indemnity',
      paragraphs: [
        'You agree to compensate us for third-party claims arising from your breach of these Terms or from using the service with documents you had no right to use.',
      ],
    },
    {
      title: 'Changes to these Terms',
      paragraphs: [
        'We may update these Terms from time to time and will tell you in the app about important changes before they take effect. Continuing to use the service after that date means you accept the updated Terms.',
      ],
    },
    {
      title: 'Governing law and disputes',
      paragraphs: [
        'These Terms are governed by the laws of the Kingdom of Thailand. We will first try to resolve any dispute through good-faith discussion; otherwise it will be decided by the competent Thai courts.',
      ],
    },
    {
      title: 'General',
      bullets: [
        'If any part of these Terms is unenforceable, the rest remains in effect.',
        'Not enforcing a right on one occasion does not waive it.',
        'These Terms and the Privacy Policy are the entire agreement between you and us about the service.',
        'If the Thai and English versions conflict, the Thai version prevails.',
      ],
    },
    {
      title: 'Contact',
      paragraphs: ['For questions about these Terms, contact the OneScan developer at the email address listed on OneScan’s Google Play page.'],
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
