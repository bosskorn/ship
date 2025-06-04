import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const { Pool } = pkg;
const app = express();
const port = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// สร้างตาราง address หากยังไม่มี
const createTableQuery = `
CREATE TABLE IF NOT EXISTS address (
  id SERIAL PRIMARY KEY,
  province_code VARCHAR(10),
  province_name VARCHAR(100),
  province_en_name VARCHAR(100),
  city_code VARCHAR(10),
  city_name VARCHAR(100),
  city_en_name VARCHAR(100),
  district_code VARCHAR(10),
  district_name VARCHAR(100),
  district_en_name VARCHAR(100),
  postal_code VARCHAR(10),
  zone VARCHAR(50)
);
`;

pool.query(createTableQuery)
  .then(() => console.log("Table 'address' is ready."))
  .catch(err => console.error("Error creating table:", err));

// API สำหรับบันทึกข้อมูลที่อยู่
app.post("/api/address", async (req, res) => {
  console.log("POST /api/address req.body:", req.body);
  const {
    province_code, province_name, province_en_name,
    city_code, city_name, city_en_name,
    district_code, district_name, district_en_name,
    postal_code, zone
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO address (
        province_code, province_name, province_en_name,
        city_code, city_name, city_en_name,
        district_code, district_name, district_en_name,
        postal_code, zone
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        province_code, province_name, province_en_name,
        city_code, city_name, city_en_name,
        district_code, district_name, district_en_name,
        postal_code, zone
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API สำหรับดึงข้อมูลที่อยู่ทั้งหมด
app.get("/api/address", async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 50;
  let offset = (page - 1) * limit;
  let province = req.query.province || '';
  let city = req.query.city || '';
  let district = req.query.district || '';
  let postal = req.query.postal || '';
  try {
    // WHERE เงื่อนไข
    let where = [];
    let params = [];
    if (province) { where.push(`province_name ILIKE $${params.length+1}`); params.push(`%${province}%`); }
    if (city) { where.push(`city_name ILIKE $${params.length+1}`); params.push(`%${city}%`); }
    if (district) { where.push(`district_name ILIKE $${params.length+1}`); params.push(`%${district}%`); }
    if (postal) { where.push(`postal_code ILIKE $${params.length+1}`); params.push(`%${postal}%`); }
    let whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    // นับจำนวนทั้งหมด
    const countResult = await pool.query(`SELECT COUNT(*) FROM address ${whereSQL}`, params);
    const total = parseInt(countResult.rows[0].count);
    // ดึงข้อมูลตามหน้า
    params.push(limit, offset);
    const result = await pool.query(`SELECT * FROM address ${whereSQL} ORDER BY id DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ success: true, data: result.rows, total, page, totalPages: Math.ceil(total/limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Autocomplete address (OR เงื่อนไข)
app.get("/api/address/autocomplete", async (req, res) => {
  const keyword = req.query.q || '';
  const limit = parseInt(req.query.limit) || 5;
  if (!keyword) return res.json({ success: true, data: [] });
  try {
    const result = await pool.query(
      `SELECT * FROM address WHERE 
        province_name ILIKE $1 OR 
        city_name ILIKE $1 OR 
        district_name ILIKE $1 OR 
        postal_code ILIKE $1 
      ORDER BY id DESC LIMIT $2`,
      [`%${keyword}%`, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "address_form.html"));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
}); 