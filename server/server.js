const path = require('path');
// Load .env from the root folder
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const DB_FILE = path.join(__dirname, 'db.json');

// --- DATABASE HELPERS ---
function readDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { products: [], users: [], orders: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

app.use(cors());
app.use(express.json());
app.use('/', express.static(path.join(__dirname, '..')));

// MySQL Connection
let dbClient = null;
try {
  dbClient = require('./db');
  dbClient.testConnection()
    .then(() => console.log('✅ MySQL Connected (User:', process.env.DB_USER + ')'))
    .catch(err => {
      console.warn('⚠️ MySQL Failed:', err.message);
      dbClient = null;
    });
} catch (e) {
  console.warn('⚠️ db.js utility not found. Falling back to db.json file.');
}

// --- REGISTER ENDPOINT ---
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, age, email, phone, password, role = 'customer' } = req.body || {};
  const emailClean = String(email || '').trim().toLowerCase();

  if (!firstName || !email || !password) {
    return res.status(400).json({ error: 'firstName, email and password are required' });
  }

  if (dbClient) {
    try {
      // Check for existing user
      const existing = await dbClient.query('SELECT id FROM users WHERE email = ?', [emailClean]);
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }

      const result = await dbClient.query(
        'INSERT INTO users (first_name, last_name, age, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [firstName, lastName, age || null, emailClean, phone || null, password, role]
      );

      return res.status(201).json({
        id: result.insertId,
        firstName, lastName, age, email: emailClean, phone, role
      });
    } catch (err) {
      console.error('DB Register Error:', err);
      return res.status(500).json({ error: 'Database error during registration' });
    }
  }

  // File Fallback
  const db = readDB();
  db.users = db.users || [];
  if (db.users.find(u => String(u.email || '').trim().toLowerCase() === emailClean)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const newUser = { id: Date.now(), firstName, lastName, age, email: emailClean, phone, password, role };
  db.users.push(newUser);
  writeDB(db);
  const out = { ...newUser };
  delete out.password;
  res.status(201).json(out);
});

// --- LOGIN ENDPOINT ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const emailClean = String(email || '').trim().toLowerCase();
  const passClean = String(password || '').trim();

  if (dbClient) {
    try {
      const rows = await dbClient.query(
        'SELECT id, first_name, last_name, age, email, phone, role, created_at FROM users WHERE email=? AND password=?',
        [emailClean, passClean]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const u = rows[0];
      return res.json({
        id: u.id, firstName: u.first_name, lastName: u.last_name,
        age: u.age, email: u.email, role: u.role
      });
    } catch (err) {
      console.error('DB Login Error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // File Fallback
  const db = readDB();
  const user = (db.users || []).find(u =>
    String(u.email || '').trim().toLowerCase() === emailClean &&
    String(u.password || '').trim() === passClean
  );

  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const out = { ...user };
  delete out.password;
  res.json(out);
});

// --- PRODUCTS ENDPOINT ---
app.get('/api/products', async (req, res) => {
  if (dbClient) {
    try {
      const results = await dbClient.query('SELECT * FROM products ORDER BY id');
      const productList = Array.isArray(results) ? results : [];
      console.log(`📦 Found ${productList.length} products in MySQL`);
      return res.json(productList);
    } catch (err) {
      console.error('Database Products Error:', err);
      return res.status(500).json({ error: 'Failed to fetch products from database' });
    }
  }

  // Fallback to file if DB isn't connected
  const fileData = readDB();
  res.json(fileData.products || []);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}/pages/index.html`));