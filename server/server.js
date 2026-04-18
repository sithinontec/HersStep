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

// Persist products (replace all) - staff Save All will call this
app.put('/api/products', async (req, res) => {
  const products = Array.isArray(req.body) ? req.body : [];

  if (dbClient) {
    // When connected to MySQL, replace products table contents inside a transaction
    try {
      // Disable foreign key checks temporarily so we can replace the products table
      await dbClient.query('SET FOREIGN_KEY_CHECKS=0');
      // Use DELETE instead of TRUNCATE to avoid permissions/constraint issues
      await dbClient.query('DELETE FROM products');

      if (products.length > 0) {
        const insertSql = 'INSERT INTO products (id, name, model, color, description, price, stock, image) VALUES ?';
        const values = products.map(p => [p.id || null, p.name || '', p.model || '', p.color || null, p.description || null, p.price || 0, p.stock || 0, p.image || null]);
        await dbClient.query(insertSql, [values]);
      }

      await dbClient.query('SET FOREIGN_KEY_CHECKS=1');
      return res.json({ success: true, count: products.length });
    } catch (err) {
      try { await dbClient.query('SET FOREIGN_KEY_CHECKS=1'); } catch (e) {}
      console.error('DB write products error:', err);
      return res.status(500).json({ error: 'Failed to persist products to database' });
    }
  }

  // File fallback
  try {
    const db = readDB();
    db.products = products;
    writeDB(db);
    return res.json({ success: true, count: products.length });
  } catch (err) {
    console.error('File write products error:', err);
    return res.status(500).json({ error: 'Failed to persist products' });
  }
});

// --- ORDERS ENDPOINTS ---
app.get('/api/orders', async (req, res) => {
  if (dbClient) {
    try {
      const ordersRows = await dbClient.query('SELECT * FROM orders ORDER BY id DESC');
      const orderIds = ordersRows.map(o => o.id);
      let items = [];
      if (orderIds.length) {
        // join with products to get product names
        items = await dbClient.query('SELECT oi.*, p.name AS product_name FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (?)', [orderIds]);
      }
      // Helper to parse shipping_address robustly
      function parseShippingAddress(val) {
        if (!val) return {};
        try {
          if (typeof val === 'object') return val;
          // Buffer -> string
          if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) val = val.toString();
          if (typeof val === 'string') {
            const parsed = JSON.parse(val);
            if (typeof parsed === 'string') return JSON.parse(parsed);
            return parsed;
          }
        } catch (e) {
          return {};
        }
        return {};
      }

      // Fetch users for orders so we can include customer name/email in the response
      const userIds = Array.from(new Set(ordersRows.map(o => o.user_id).filter(Boolean)));
      let users = [];
      if (userIds.length) {
        users = await dbClient.query('SELECT id, first_name, last_name, email FROM users WHERE id IN (?)', [userIds]);
      }
      const userMap = {};
      users.forEach(u => { userMap[u.id] = { firstName: u.first_name, lastName: u.last_name, email: u.email }; });

      // Attach items to orders and map to frontend-friendly shape
      const map = {};
      ordersRows.forEach(o => {
        map[o.id] = {
          id: o.id,
          orderNumber: o.order_number,
          userId: o.user_id,
          user: userMap[o.user_id] || null,
          total: Number(o.total),
          discount: Number(o.discount),
          paymentMethod: o.payment_method,
          status: o.status,
          shippingAddress: parseShippingAddress(o.shipping_address),
          createdAt: o.created_at,
          items: []
        };
      });
      items.forEach(it => {
        if (map[it.order_id]) {
          map[it.order_id].items.push({ id: it.id, productId: it.product_id, name: it.product_name || null, quantity: it.quantity, unitPrice: Number(it.unit_price) });
        }
      });
      // Robust parsing: some rows may have shipping_address as a string, double-encoded JSON, or null
      const out = Object.values(map).map(o => {
        const sa = o.shippingAddress;
        if (!sa || (Object.keys(sa).length === 0 && typeof sa === 'object')) {
          // try to read raw string from original row if available
          // Note: ordersRows retains original rows; find matching row
          const raw = ordersRows.find(r => r.id === o.id);
          if (raw && raw.shipping_address) {
            try {
              let parsed = JSON.parse(raw.shipping_address);
              if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
              }
              o.shippingAddress = parsed || {};
            } catch (e) {
              o.shippingAddress = {};
            }
          }
        }
        // Expose convenient user fields for front-end fallback
        if (o.user) {
          o.userEmail = o.user.email || null;
          o.userFirstName = o.user.firstName || null;
          o.userLastName = o.user.lastName || null;
        }
        return o;
      });
      return res.json(out);
    } catch (err) {
      console.error('Database Orders GET Error:', err);
      return res.status(500).json({ error: 'Failed to fetch orders from database' });
    }
  }

  // file fallback
  try {
    const db = readDB();
    return res.json(db.orders || []);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read orders' });
  }
});

// Create a new order
app.post('/api/orders', async (req, res) => {
  const order = req.body || {};
  if (!order) return res.status(400).json({ error: 'Invalid order' });

  if (dbClient) {
    try {
      await dbClient.query('START TRANSACTION');
      const orderNumber = order.id || ('ORD-' + Date.now());
      const total = Number(order.total) || 0;
      const discount = Number(order.discount) || 0;
      const payment_method = order.paymentMethod || null;
      const status = order.status || 'placed';
      const shipping = order.shippingAddress ? JSON.stringify(order.shippingAddress) : null;
      const userId = (order.userId && Number(order.userId)) ? Number(order.userId) : null;

      const insertOrder = await dbClient.query(
        'INSERT INTO orders (order_number, user_id, total, discount, payment_method, status, shipping_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [orderNumber, userId, total, discount, payment_method, status, shipping]
      );
      const newOrderId = insertOrder.insertId;

      if (Array.isArray(order.items) && order.items.length) {
        // Aggregate quantities per product id
        const qtyMap = {};
        order.items.forEach(it => {
          const pid = Number(it.id || it.productId || it.product_id || 0);
          if (!pid) return;
          qtyMap[pid] = (qtyMap[pid] || 0) + (Number(it.quantity) || 1);
        });
        const pids = Object.keys(qtyMap).map(Number).filter(Boolean);
        if (pids.length) {
          // Check availability
          const dbProds = await dbClient.query('SELECT id, stock FROM products WHERE id IN (?) FOR UPDATE', [pids]);
          const stockMap = {};
          dbProds.forEach(p => { stockMap[p.id] = Number(p.stock || 0); });
          for (const pid of pids) {
            if ((stockMap[pid] || 0) < (qtyMap[pid] || 0)) {
              throw new Error('Insufficient stock for product id ' + pid);
            }
          }
          // Decrement stock for each product
          for (const pid of pids) {
            const dec = qtyMap[pid];
            await dbClient.query('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [dec, pid]);
          }
        }

        const itemValues = order.items.map(it => [newOrderId, it.id || it.productId || null, it.quantity || 1, it.price || it.unitPrice || 0]);
        await dbClient.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ?', [itemValues]);
      }

      await dbClient.query('COMMIT');

      // Fetch the inserted order to return
      const rows = await dbClient.query('SELECT * FROM orders WHERE id = ?', [newOrderId]);
      const inserted = rows && rows[0] ? rows[0] : null;
      if (inserted) {
        try { inserted.shipping_address = JSON.parse(inserted.shipping_address); } catch (e) { inserted.shipping_address = {}; }
        const out = {
          id: inserted.id,
          orderNumber: inserted.order_number,
          userId: inserted.user_id,
          total: Number(inserted.total),
          discount: Number(inserted.discount),
          paymentMethod: inserted.payment_method,
          status: inserted.status,
          shippingAddress: inserted.shipping_address || {},
          createdAt: inserted.created_at
        };
        return res.status(201).json(Object.assign(out, { items: order.items || [] }));
      }
      return res.status(201).json({ items: order.items || [] });
    } catch (err) {
      try { await dbClient.query('ROLLBACK'); } catch (e) {}
      console.error('Database Orders POST Error:', err);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }

  // File fallback: append to file DB
  try {
    const db = readDB();
    const id = Date.now();
    const newOrder = Object.assign({ id, order_number: order.id || ('ORD-' + Date.now()), created_at: new Date().toISOString() }, order);
    db.orders = db.orders || [];
    db.orders.push(newOrder);
    writeDB(db);
    return res.status(201).json(newOrder);
  } catch (err) {
    console.error('File Orders POST Error:', err);
    return res.status(500).json({ error: 'Failed to persist order' });
  }
});

// Update order status (partial update)
app.patch('/api/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!id || !status) return res.status(400).json({ error: 'Invalid id or status' });

  if (dbClient) {
    try {
      await dbClient.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
      // return minimal updated info
      const rows = await dbClient.query('SELECT * FROM orders WHERE id = ?', [id]);
      const o = rows && rows[0] ? rows[0] : null;
      if (o) {
        let shipping = {};
        try { shipping = o.shipping_address ? JSON.parse(o.shipping_address) : {}; } catch (e) { shipping = {}; }
        return res.json({ id: o.id, orderNumber: o.order_number, userId: o.user_id, status: o.status, shippingAddress: shipping });
      }
      return res.status(404).json({ error: 'Order not found' });
    } catch (err) {
      console.error('Database Orders PATCH Error:', err);
      return res.status(500).json({ error: 'Failed to update order' });
    }
  }

  // File fallback: try updating in db.json
  try {
    const db = readDB();
    const idx = (db.orders || []).findIndex(x => Number(x.id) === id || String(x.order_number) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });
    db.orders[idx].status = status;
    writeDB(db);
    return res.json({ id: db.orders[idx].id, orderNumber: db.orders[idx].order_number, userId: db.orders[idx].user_id, status });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update order' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}/pages/index.html`));