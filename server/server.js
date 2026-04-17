const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

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

const app = express();
app.use(cors());
app.use(express.json());
// Serve static site from parent folder so the frontend can call the API on the same origin
app.use('/', express.static(path.join(__dirname, '..')));

// Optional: try to use SQL connector (MySQL via server/db.js)
let dbClient = null;
try {
  dbClient = require('./db');
  // Test the SQL connection; if it fails, disable dbClient so we use the file DB fallback
  dbClient.testConnection().catch(err => {
    console.warn('DB test connection failed - continuing with file DB.', err && err.message ? err.message : err);
    try { dbClient = null; } catch (e) {}
  });
} catch (e) {
  // fallback to file DB
}

app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Debug endpoints (development only) to help diagnose DB/login issues
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/pingdb', async (req, res) => {
    if (!dbClient) return res.json({ connected: false, reason: 'no dbClient (using file DB fallback)' });
    try {
      await dbClient.testConnection();
      return res.json({ connected: true });
    } catch (err) {
      return res.json({ connected: false, error: String(err) });
    }
  });

  app.get('/api/debug/user', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'email query required' });
    if (dbClient) {
      try {
        const r = await dbClient.query('SELECT id, first_name, last_name, age, email, phone, role, created_at, password FROM users WHERE email=$1', [email]);
        if (!r.rows || r.rows.length === 0) return res.status(404).json({ found: false });
        return res.json({ found: true, user: r.rows[0] });
      } catch (err) {
        console.error('Debug user error', err);
        return res.status(500).json({ error: 'DB error' });
      }
    }
    const db = readDB();
    const u = (db.users || []).find(u => u.email === email);
    if (!u) return res.status(404).json({ found: false });
    return res.json({ found: true, user: u });
  });

  // Check login match using query params to avoid JSON quoting issues in CLI
  app.get('/api/debug/checklogin', async (req, res) => {
    const email = req.query.email || '';
    const password = req.query.password || '';
    const emailClean = String(email).trim().toLowerCase();
    const passClean = String(password).trim();
    if (dbClient) {
      try {
        const r = await dbClient.query('SELECT id, email, password FROM users WHERE email=$1', [emailClean]);
        const found = r.rows && r.rows.length > 0;
        const stored = found ? r.rows[0] : null;
        const storedPassword = stored ? String(stored.password || '') : null;
        const matches = found && (String(storedPassword).trim() === passClean);
        return res.json({ found, emailClean, passLen: passClean.length, storedPassword, matches });
      } catch (err) {
        console.error('Debug checklogin db error', err);
        return res.status(500).json({ error: 'DB error' });
      }
    }
    const db = readDB();
    const user = (db.users || []).find(u => String(u.email || '').trim().toLowerCase() === emailClean);
    const storedPassword = user ? String(user.password || '') : null;
    const matches = user && (String(storedPassword).trim() === passClean);
    return res.json({ found: !!user, emailClean, passLen: passClean.length, storedPassword, matches });
  });
}

// PRODUCTS
app.get('/api/products', async (req, res) => {
  if (dbClient) {
    try {
      const r = await dbClient.query('SELECT id, name, model, color, description, price, stock, image FROM products ORDER BY id');
      return res.json(r.rows);
    } catch (err) {
      console.error('DB products read error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  res.json(db.products || []);
});

app.put('/api/products', async (req, res) => {
  if (dbClient) {
    const products = Array.isArray(req.body) ? req.body : [];
    let trx = null;
    try {
      trx = await dbClient.pool.connect();
      await trx.query('BEGIN');
      await trx.query('TRUNCATE TABLE products');
      for (const p of products) {
        await trx.query(
          'INSERT INTO products(name, model, color, description, price, stock, image) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [p.name, p.model || p.category, p.color, p.description, p.price, p.stock, p.image]
        );
      }
      await trx.query('COMMIT');
      return res.json({ ok: true });
    } catch (err) {
      if (trx) await trx.query('ROLLBACK');
      console.error('DB products write error', err);
      return res.status(500).json({ error: 'DB error' });
    } finally {
      if (trx) trx.release();
    }
  }
  const db = readDB();
  db.products = Array.isArray(req.body) ? req.body : db.products;
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/products', async (req, res) => {
  if (dbClient) {
    const payload = req.body || {};
    try {
      const ins = await dbClient.query(
        'INSERT INTO products(name, model, color, description, price, stock, image) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [payload.name, payload.model || payload.category, payload.color, payload.description, payload.price, payload.stock, payload.image]
      );
      const newId = ins.rows && ins.rows[0] && ins.rows[0].id;
      if (!newId) return res.status(500).json({ error: 'Insert failed' });
      const sel = await dbClient.query('SELECT id, name, model, color, description, price, stock, image FROM products WHERE id=$1', [newId]);
      return res.json(sel.rows[0]);
    } catch (err) {
      console.error('DB insert product error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  db.products = db.products || [];
  const payload = req.body || {};
  const nextId = db.products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
  const prod = {
    id: nextId,
    name: payload.name || 'Untitled',
    model: payload.model || payload.category || 'Unspecified',
    color: payload.color || 'Unknown',
    price: Number(payload.price) || 0,
    description: payload.description || '',
    stock: Number(payload.stock) || 0,
    image: payload.image || ''
  };
  db.products.push(prod);
  writeDB(db);
  res.json(prod);
});

app.put('/api/products/:id', async (req, res) => {
  if (dbClient) {
    const id = Number(req.params.id);
    const payload = req.body || {};
    try {
      await dbClient.query(
        'UPDATE products SET name=$1, model=$2, color=$3, description=$4, price=$5, stock=$6, image=$7 WHERE id=$8',
        [payload.name, payload.model || payload.category, payload.color, payload.description, payload.price, payload.stock, payload.image, id]
      );
      const sel = await dbClient.query('SELECT id, name, model, color, description, price, stock, image FROM products WHERE id=$1', [id]);
      return res.json(sel.rows[0]);
    } catch (err) {
      console.error('DB update product error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  const id = Number(req.params.id);
  const idx = (db.products || []).findIndex(p => Number(p.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const payload = req.body || {};
  db.products[idx] = { ...db.products[idx], ...payload, id };
  writeDB(db);
  res.json(db.products[idx]);
});

app.delete('/api/products/:id', async (req, res) => {
  if (dbClient) {
    const id = Number(req.params.id);
    try {
      await dbClient.query('DELETE FROM products WHERE id=$1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('DB delete product error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  const id = Number(req.params.id);
  db.products = (db.products || []).filter(p => Number(p.id) !== id);
  writeDB(db);
  res.json({ ok: true });
});

// ORDERS
app.get('/api/orders', async (req, res) => {
  if (dbClient) {
    try {
      const r = await dbClient.query('SELECT id, order_number, user_id, total, discount, payment_method, status, shipping_address, created_at FROM orders ORDER BY created_at DESC');
      const out = [];
      for (const row of r.rows) {
        const itemsRes = await dbClient.query('SELECT oi.product_id AS id, p.name, p.image, oi.unit_price AS price, oi.quantity FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [row.id]);
        let shipping = row.shipping_address;
        try { if (typeof shipping === 'string') shipping = JSON.parse(shipping); } catch (e) {}
        out.push({
          id: row.order_number,
          userId: row.user_id,
          total: Number(row.total),
          discount: Number(row.discount),
          paymentMethod: row.payment_method,
          status: row.status,
          shippingAddress: shipping,
          createdAt: row.created_at,
          items: (itemsRes.rows || []).map(it => ({ id: it.id, name: it.name, image: it.image, price: Number(it.price), quantity: it.quantity }))
        });
      }
      return res.json(out);
    } catch (err) {
      console.error('DB orders read error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  res.json(db.orders || []);
});

app.put('/api/orders', async (req, res) => {
  if (dbClient) {
    const orders = Array.isArray(req.body) ? req.body : [];
    let trx = null;
    try {
      trx = await dbClient.pool.connect();
      await trx.query('BEGIN');
      await trx.query('TRUNCATE TABLE order_items');
      await trx.query('TRUNCATE TABLE orders');
      for (const o of orders) {
        const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
        const r = await trx.query(
          'INSERT INTO orders(order_number, user_id, total, discount, payment_method, status, shipping_address, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [o.id || ('ORD-' + Date.now()), o.userId || null, o.total || 0, o.discount || 0, o.paymentMethod || null, o.status || 'placed', JSON.stringify(o.shippingAddress) || null, createdAt]
        );
        const orderId = r.rows && r.rows[0] && r.rows[0].id;
        if (Array.isArray(o.items)) {
          for (const it of o.items) {
            await trx.query('INSERT INTO order_items(order_id, product_id, quantity, unit_price) VALUES($1,$2,$3,$4)', [orderId, it.id || it.productId, it.quantity || 1, it.price || it.unit_price || 0]);
          }
        }
      }
      await trx.query('COMMIT');
      return res.json({ ok: true });
    } catch (err) {
      if (trx) await trx.query('ROLLBACK');
      console.error('DB orders write error', err);
      return res.status(500).json({ error: 'DB error' });
    } finally {
      if (trx) trx.release();
    }
  }
  const db = readDB();
  db.orders = Array.isArray(req.body) ? req.body : db.orders;
  writeDB(db);
  res.json({ ok: true });
});

// Place an order: check stock, decrement, and save
app.post('/api/orders', async (req, res) => {
  if (dbClient) {
    const payload = req.body || {};
    if (!payload || !Array.isArray(payload.items)) return res.status(400).json({ error: 'Invalid order' });
    let trx = null;
    try {
      trx = await dbClient.pool.connect();
      await trx.query('BEGIN');

      // Check stock for each item (lock row)
      for (const it of payload.items) {
        const pRes = await trx.query('SELECT id, stock, price FROM products WHERE id=$1 FOR UPDATE', [it.id]);
        const prodRow = pRes.rows && pRes.rows[0];
        if (!prodRow) throw new Error(`Product not found: ${it.id}`);
        if (prodRow.stock < Number(it.quantity)) throw new Error(`Insufficient stock for ${prodRow.id}`);
      }

      // Decrement stock
      for (const it of payload.items) {
        await trx.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [it.quantity, it.id]);
      }

      // Insert order
      const orderNumber = payload.id || ('ORD-' + Date.now());
      const createdAt = new Date();
      const oRes = await trx.query(
        'INSERT INTO orders(order_number, user_id, total, discount, payment_method, status, shipping_address, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [orderNumber, payload.userId || null, payload.total || 0, payload.discount || 0, payload.paymentMethod || null, payload.status || 'placed', JSON.stringify(payload.shippingAddress) || null, createdAt]
      );
      const newOrderId = oRes.rows && oRes.rows[0] && oRes.rows[0].id;

      // Insert order items
      for (const it of payload.items) {
        const pRes = await trx.query('SELECT price FROM products WHERE id=$1', [it.id]);
        const unitPrice = pRes.rows && pRes.rows[0] ? pRes.rows[0].price : (it.price || 0);
        await trx.query('INSERT INTO order_items(order_id, product_id, quantity, unit_price) VALUES($1,$2,$3,$4)', [newOrderId, it.id, it.quantity, unitPrice]);
      }

      await trx.query('COMMIT');

      // assemble order
      const selOrder = await dbClient.query('SELECT id, order_number, user_id, total, discount, payment_method, status, shipping_address, created_at FROM orders WHERE id=$1', [newOrderId]);
      const orderRow = selOrder.rows && selOrder.rows[0];
      const itemsRes = await dbClient.query('SELECT oi.product_id AS id, p.name, p.image, oi.unit_price AS price, oi.quantity FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [newOrderId]);
      let shipping = orderRow.shipping_address;
      try { if (typeof shipping === 'string') shipping = JSON.parse(shipping); } catch (e) {}
      const final = {
        id: orderRow.order_number,
        userId: orderRow.user_id,
        total: Number(orderRow.total),
        discount: Number(orderRow.discount),
        paymentMethod: orderRow.payment_method,
        status: orderRow.status,
        shippingAddress: shipping,
        createdAt: orderRow.created_at,
        items: (itemsRes.rows || []).map(it => ({ id: it.id, name: it.name, image: it.image, price: Number(it.price), quantity: it.quantity }))
      };
      return res.json(final);
    } catch (err) {
      if (trx) await trx.query('ROLLBACK');
      console.error('DB place order error', err);
      return res.status(400).json({ error: err.message || 'Order failed' });
    } finally { if (trx) trx.release(); }
  }
  const db = readDB();
  const order = req.body;
  if (!order || !order.items || !Array.isArray(order.items)) return res.status(400).json({ error: 'Invalid order' });

  // Verify stock availability
  for (const item of order.items) {
    const prod = (db.products || []).find(p => Number(p.id) === Number(item.id));
    if (!prod) return res.status(400).json({ error: `Product not found: ${item.id}` });
    if (prod.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${prod.name}` });
  }

  // Decrement stock
  for (const item of order.items) {
    const prod = (db.products || []).find(p => Number(p.id) === Number(item.id));
    prod.stock = Number(prod.stock) - Number(item.quantity);
  }

  db.orders = db.orders || [];
  const newOrder = { ...order, id: 'ORD-' + Date.now(), createdAt: new Date().toISOString() };
  db.orders.push(newOrder);
  writeDB(db);
  res.json(newOrder);
});

// Auth endpoints
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const emailRaw = email;
  const passwordRaw = password;
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const passClean = String(passwordRaw || '').trim();
  console.log('Login attempt', { emailRaw: String(emailRaw).slice(0, 200), emailClean, passwordLen: passwordRaw ? passwordRaw.length : 0, passCleanLen: passClean.length, usingDbClient: !!dbClient });
  if (dbClient) {
    try {
      const r = await dbClient.query('SELECT id, first_name, last_name, age, email, phone, role, created_at FROM users WHERE email=$1 AND password=$2', [emailClean, passClean]);
      console.log('DB login query result rows:', (r && r.rows) ? r.rows.length : 0);
      if (!r.rows || r.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });
      const u = r.rows[0];
      return res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, age: u.age, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at });
    } catch (err) {
      console.error('DB login error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  // Normalize stored values when comparing to tolerate whitespace/case issues
  const user = (db.users || []).find(u => String(u.email || '').trim().toLowerCase() === emailClean && String(u.password || '').trim() === passClean);
  if (!user) {
    console.log('File DB users emails:', (db.users || []).map(u => String(u.email || '')));
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const out = { ...user };
  delete out.password;
  res.json(out);
});

app.post('/api/register', async (req, res) => {
  if (dbClient) {
    const payload = req.body || {};
    let trx = null;
    try {
      trx = await dbClient.pool.connect();
      await trx.query('BEGIN');
      const existsRes = await trx.query('SELECT id FROM users WHERE email=$1 OR (phone IS NOT NULL AND phone=$2)', [payload.email, payload.phone || null]);
      if (existsRes.rows && existsRes.rows.length > 0) {
        await trx.query('ROLLBACK');
        return res.status(400).json({ error: 'Account with this email/phone number already exists' });
      }
      const r = await trx.query(
        'INSERT INTO users(first_name, last_name, age, email, phone, password, role, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [payload.firstName || '', payload.lastName || '', payload.age || null, payload.email, payload.phone || null, payload.password || '', payload.role || 'customer', new Date()]
      );
      const newId = r.rows && r.rows[0] && r.rows[0].id;
      if (!newId) {
        await trx.query('ROLLBACK');
        return res.status(500).json({ error: 'Insert failed' });
      }
      const uRes = await trx.query('SELECT id, first_name, last_name, age, email, phone, role, created_at FROM users WHERE id=$1', [newId]);
      await trx.query('COMMIT');
      const u = uRes.rows[0];
      return res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, age: u.age, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at });
    } catch (err) {
      if (trx) await trx.query('ROLLBACK');
      console.error('DB register error', err);
      return res.status(500).json({ error: 'DB error' });
    } finally {
      if (trx) trx.release();
    }
  }
  const db = readDB();
  const payload = req.body || {};
  const exists = (db.users || []).some(u => u.email === payload.email || (payload.phone && u.phone === payload.phone));
  if (exists) return res.status(400).json({ error: 'Account with this email/phone number already exists' });
  const nextId = (db.users || []).reduce((m, u) => Math.max(m, Number(u.id) || 0), 0) + 1;
  const newUser = {
    id: nextId,
    firstName: payload.firstName || '',
    lastName: payload.lastName || '',
    age: payload.age || null,
    email: payload.email,
    phone: payload.phone || null,
    password: payload.password || '',
    role: payload.role || 'customer',
    createdAt: new Date().toISOString()
  };
  db.users = db.users || [];
  db.users.push(newUser);
  writeDB(db);
  const out = { ...newUser };
  delete out.password;
  res.json(out);
});

app.put('/api/users/:id', async (req, res) => {
  if (dbClient) {
    try {
      const id = Number(req.params.id);
      const payload = req.body || {};
      await dbClient.query('UPDATE users SET first_name=$1, last_name=$2, age=$3, email=$4, phone=$5, role=$6 WHERE id=$7', [payload.firstName, payload.lastName, payload.age, payload.email, payload.phone, payload.role, id]);
      const uRes = await dbClient.query('SELECT id, first_name, last_name, age, email, phone, role, created_at FROM users WHERE id=$1', [id]);
      if (!uRes.rows || uRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const u = uRes.rows[0];
      return res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, age: u.age, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at });
    } catch (err) {
      console.error('DB update user error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  const id = Number(req.params.id);
  const idx = (db.users || []).findIndex(u => Number(u.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const payload = req.body || {};
  db.users[idx] = { ...db.users[idx], ...payload, id };
  writeDB(db);
  const out = { ...db.users[idx] };
  delete out.password;
  res.json(out);
});

app.post('/api/reset-password', async (req, res) => {
  if (dbClient) {
    try {
      const { email } = req.body || {};
      const r = await dbClient.query('SELECT id FROM users WHERE email=$1', [email]);
      if (!r.rows || r.rows.length === 0) return res.status(404).json({ error: 'No account found with this email' });
      // In real system: send email. Here we just acknowledge.
      return res.json({ ok: true });
    } catch (err) {
      console.error('DB reset-password error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }
  const db = readDB();
  const { email } = req.body || {};
  const user = (db.users || []).find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'No account found with this email' });
  // In real system: send email. Here we just acknowledge.
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('http://localhost:' + port + '/pages/index.html'));
