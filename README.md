# Ship — Android test builds (v0.1.1-demo)

| ไฟล์ | แอป |
|---|---|
| `Ship-Customer-0.1.1-demo.apk` | แอปลูกค้า (th.co.ship.customer) |
| `Ship-Driver-0.1.1-demo.apk` | แอปคนขับ (th.co.ship.driver) |

- สำหรับทดสอบภายในเท่านั้น: เซ็นด้วย development key, รองรับมือถือ Android 64-bit (arm64)
- ติดตั้ง: ดาวน์โหลดไฟล์ → เปิด → อนุญาต "ติดตั้งแอปที่ไม่รู้จัก"
- แอปชี้ไปที่ API `http://localhost:4000` (ค่า dev) ต้อง deploy backend และ build ใหม่ด้วย `EXPO_PUBLIC_API_URL` ก่อนจึงจะล็อกอินได้
- สร้างจากโค้ด branch `claude/delivery-platform-mvp`

## โหมดสาธิต (v0.1.1)
กด "ทดลองใช้งาน (โหมดสาธิต)" ที่หน้าล็อกอิน เพื่อเข้าใช้ทุกหน้าด้วยข้อมูลจำลอง ไม่ต้องมีเซิร์ฟเวอร์
