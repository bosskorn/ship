# Address API Documentation

API นี้ใช้สำหรับจัดการข้อมูลที่อยู่ (Address) และรองรับการค้นหา/กรอก/นำเข้า/แสดงผลข้อมูลที่อยู่ของประเทศไทย

## Base URL

```
http://localhost:3001
```

---

## 1. สร้าง/บันทึกข้อมูลที่อยู่

**Endpoint:**
```
POST /api/address
```

**Request Body (JSON):**
```json
{
  "province_code": "TH01",
  "province_name": "กรุงเทพมหานคร",
  "province_en_name": "Bangkok",
  "city_code": "TH0140",
  "city_name": "ลาดพร้าว",
  "city_en_name": "Lat Phrao",
  "district_code": "TH014001",
  "district_name": "ลาดพร้าว",
  "district_en_name": "Lat Phrao",
  "postal_code": "10230",
  "zone": "กลาง"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ...ข้อมูลที่บันทึก... }
}
```

---

## 2. ดึงข้อมูลที่อยู่ (พร้อมกรองและแบ่งหน้า)

**Endpoint:**
```
GET /api/address
```

**Query Parameters:**
- `page` (default 1): เลขหน้าที่ต้องการ
- `limit` (default 50): จำนวนข้อมูลต่อหน้า
- `province` (optional): กรองชื่อจังหวัด
- `city` (optional): กรองชื่ออำเภอ/เขต
- `district` (optional): กรองชื่อตำบล/แขวง
- `postal` (optional): กรองรหัสไปรษณีย์

**ตัวอย่าง:**
```
GET /api/address?page=1&limit=10&province=กรุงเทพมหานคร&city=ลาดพร้าว
```

**Response:**
```json
{
  "success": true,
  "data": [ ...ข้อมูล... ],
  "total": 123,
  "page": 1,
  "totalPages": 13
}
```

---

## 3. Autocomplete (ค้นหาข้อมูลที่อยู่แบบ OR)

**Endpoint:**
```
GET /api/address/autocomplete?q=keyword&limit=5
```
- `q`: คำค้น (ค้นหาจาก province_name, city_name, district_name, postal_code)
- `limit`: จำนวนผลลัพธ์สูงสุด (default 5)

**ตัวอย่าง:**
```
GET /api/address/autocomplete?q=ลาดพร้าว&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "province_name": "กรุงเทพมหานคร",
      "city_name": "ลาดพร้าว",
      "district_name": "ลาดพร้าว",
      "postal_code": "10230",
      ...
    },
    ...
  ]
}
```

---

## 4. นำเข้าข้อมูลที่อยู่ด้วย Excel

- ส่งไฟล์ Excel ผ่านฟอร์ม (frontend) โดยแต่ละ column ต้องตรงกับ field ในฐานข้อมูล
- ตัวอย่าง header:
  - province_code, province_name, province_en_name, city_code, city_name, city_en_name, district_code, district_name, district_en_name, postal_code, zone

---

## 5. ตัวอย่างการ Integrate กับ Frontend (HTML/JS)

### Autocomplete
```js
const input = document.getElementById('serviceArea');
input.addEventListener('input', async function() {
  const keyword = input.value.trim();
  if (!keyword) return;
  const res = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(keyword)}&limit=5`);
  const result = await res.json();
  if(result.success) {
    // แสดง suggestion จาก result.data
  }
});
```

### บันทึกข้อมูลที่อยู่
```js
const data = { ... };
fetch('/api/address', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### ดึงข้อมูลที่อยู่แบบแบ่งหน้า/กรอง
```js
fetch('/api/address?page=1&limit=10&province=กรุงเทพมหานคร')
  .then(res => res.json())
  .then(result => {
    // ใช้งาน result.data
  });
```

---

## 6. หมายเหตุ
- ทุก endpoint รองรับ CORS (สามารถเรียกจาก frontend ได้)
- ถ้าแก้ไข schema หรือเพิ่ม field ต้องปรับทั้ง backend และ frontend ให้ตรงกัน
- หาก deploy จริงควรเปลี่ยน BASE URL ให้ตรงกับ production 