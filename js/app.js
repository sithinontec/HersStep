// ========================================
// HersStep - Main Application Data & State
// ========================================

// 1. GLOBAL STATE DEFINITION
const store = {
    products: [],
    cart: [],
    users: [],
    orders: [],
    currentUser: null,
    // Promo codes for testing: keys are code strings
    promoCodes: {
        'SAVE10': { type: 'percent', value: 10 },   // 10% off
        'WELCOME20': { type: 'percent', value: 20 }, // 20% off
        'FIVEOFF': { type: 'fixed', value: 5 }       // $5 off
    }
};

// Robust Response.json patch to avoid parse errors on empty bodies
(function() {
    if (typeof Response !== 'undefined' && Response.prototype && !Response.prototype._safeJsonPatched) {
        Response.prototype._safeJsonPatched = true;
        const origJson = Response.prototype.json;
        Response.prototype.json = async function() {
            try {
                const clone = this.clone();
                const txt = await clone.text();
                if (!txt) return null;
                return JSON.parse(txt);
            } catch (e) {
                try { return await origJson.call(this); } catch (_) { return null; }
            }
        };
    }
})();

// Helper for error extraction
function extractError(data, fallback) {
    if (data && typeof data === 'object') {
        if (typeof data.error === 'string' && data.error) return data.error;
        if (typeof data.message === 'string' && data.message) return data.message;
    }
    return fallback || 'Request failed';
}

// FIX 1: formatCurrency was used in index.html but never defined
function formatCurrency(amount) {
    return '$' + Number(amount).toFixed(2);
}

// 2. USER MANAGEMENT
const auth = {
    register: async function(firstName, lastName, age, email, phone, password, role = 'customer') {
        const payload = { firstName, lastName, age, email, phone, password, role };
        const res = await fetch((window.API_BASE || '') + '/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(extractError(data, 'Registration failed'));
        store.currentUser = data;
        this.saveSession();
        return data;
    },

    login: async function(email, password) {
        const emailClean = String(email || '').trim().toLowerCase();
        const passClean = String(password || '');

        const res = await fetch((window.API_BASE || '') + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailClean, password: passClean })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(extractError(data, 'Invalid email or password'));

        store.currentUser = data;
        this.saveSession();
        return data;
    },

    logout: function() {
        store.currentUser = null;
        // Clear the user's cart on logout to avoid persisting items between sessions
        try {
            if (typeof cart !== 'undefined' && typeof cart.clear === 'function') cart.clear();
        } catch (e) {}
        localStorage.removeItem('hersstep_currentUser');
        window.location.href = 'index.html';
    },

    saveSession: function() {
        if (store.currentUser) {
            localStorage.setItem('hersstep_currentUser', JSON.stringify(store.currentUser));
        }
    },

    loadSession: function() {
        const saved = localStorage.getItem('hersstep_currentUser');
        if (saved) {
            try { store.currentUser = JSON.parse(saved); } catch (e) {}
        }
    }
};

// 3. CART MANAGEMENT
const cart = {
    add: function(product, quantity = 1) {
        // Ensure we never add more than available stock
        const stockAvailable = Number(product.stock || 0);
        if (stockAvailable <= 0) {
            window.showNotification('Item is out of stock', 'error');
            return;
        }

        const existingItem = store.cart.find(item => item.id === product.id);
        if (existingItem) {
            const desired = existingItem.quantity + Number(quantity || 0);
            if (desired > stockAvailable) {
                existingItem.quantity = stockAvailable;
                this.saveCart();
                updateCartCount();
                window.showNotification('Added up to available stock only', 'warning');
                return;
            }
            existingItem.quantity = desired;
        } else {
            const q = Number(quantity || 0) > stockAvailable ? stockAvailable : Number(quantity || 0);
            store.cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity: q,
                stock: product.stock
            });
            if (q < Number(quantity || 0)) {
                window.showNotification('Added up to available stock only', 'warning');
            }
        }
        this.saveCart();
        updateCartCount();
    },

    saveCart: function() {
        localStorage.setItem('hersstep_cart', JSON.stringify(store.cart));
    },

    // Inside your cart object in app.js
    loadCart: function() {
    const saved = localStorage.getItem('hersstep_cart'); // Ensure this key is consistent
    if (saved) {
        try { 
            store.cart = JSON.parse(saved); 
        } catch (e) { 
            store.cart = []; 
        }
    }
    },

    getItemCount: function() {
        return store.cart.reduce((count, item) => count + item.quantity, 0);
    },

    // FIX: getTotal was called in cart.html but never existed
    getTotal: function() {
    return store.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },

    // FIX: remove was called in cart.html but never existed
    remove: function(productId) {
        store.cart = store.cart.filter(item => item.id !== productId);
        this.saveCart();
        updateCartCount();
    },

    // FIX: updateQuantity was called in cart.html but never existed
    updateQuantity: function(productId, newQuantity) {
        if (newQuantity <= 0) {
            // Remove the item entirely if quantity drops to 0 or below
            this.remove(productId);
            return;
        }
        const item = store.cart.find(i => i.id === productId);
        if (item) {
            const stockAvailable = Number(item.stock || 0);
            if (Number(newQuantity) > stockAvailable) {
                item.quantity = stockAvailable;
                window.showNotification('Quantity capped to available stock', 'warning');
            } else {
                item.quantity = newQuantity;
            }
            this.saveCart();
            updateCartCount();
        }
    },

    clear: function() {
        store.cart = [];
        this.saveCart();
        updateCartCount();
    }
};

// 4. PRODUCT MANAGEMENT
// Products service with localStorage-backed CRUD for staff pages and a
// network loader used by public pages. Provides helpers used by staff-products.html.
const products = {
    // Always load products from the server database API
    loadProducts: function() {
        return fetch((window.API_BASE || '') + '/api/products')
            .then(async r => {
                if (!r.ok) throw new Error('Failed to fetch products from API');
                const data = await r.json();
                if (Array.isArray(data)) {
                    window.store.products = data;
                    if (typeof window.renderProducts === 'function') window.renderProducts();
                }
                return data;
            })
            .catch(err => {
                console.error('products.loadProducts error:', err);
                // Keep store.products unchanged on error and rethrow
                throw err;
            });
    },
    storageKey: 'hersstep_products',
    loadFromStorage: function() {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
            try { store.products = JSON.parse(raw); } catch (e) { store.products = []; }
        } else {
            store.products = store.products || [];
        }
    },
    saveProducts: function() {
        localStorage.setItem(this.storageKey, JSON.stringify(store.products || []));
    },
    getById: function(id) {
        return (store.products || []).find(p => Number(p.id) === Number(id));
    },
    validate: function(data, existingId) {
        const errors = [];
        if (!data.name || String(data.name).trim().length < 1) errors.push('Name is required');
        if (!data.price || Number(data.price) < 0) errors.push('Price must be a non-negative number');
        if (data.stock == null || Number(data.stock) < 0) errors.push('Stock must be 0 or greater');
        return errors;
    },
    add: async function(productData) {
        const errors = this.validate(productData);
        if (errors.length) throw new Error(errors.join('; '));
        const id = (store.products && store.products.length ? Math.max(...store.products.map(p => Number(p.id) || 0)) + 1 : 1);
        const prod = Object.assign({ id }, productData);
        store.products = store.products || [];
        store.products.push(prod);

        // Try to persist to API
        try {
            const res = await fetch((window.API_BASE || '') + '/api/products', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.products)
            });
            if (!res.ok) throw new Error('API save failed');
        } catch (e) {
            // Fallback: save locally
            this.saveProducts();
        }

        return prod;
    },
    update: async function(id, updates) {
        const p = this.getById(id);
        if (!p) throw new Error('Product not found');
        const merged = Object.assign({}, p, updates);
        const errors = this.validate(merged, id);
        if (errors.length) throw new Error(errors.join('; '));
        Object.assign(p, updates);

        try {
            const res = await fetch((window.API_BASE || '') + '/api/products', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.products)
            });
            if (!res.ok) throw new Error('API save failed');
        } catch (e) {
            this.saveProducts();
        }

        return p;
    },
    remove: async function(id) {
        const before = store.products ? store.products.length : 0;
        store.products = (store.products || []).filter(p => Number(p.id) !== Number(id));
        try {
            const res = await fetch((window.API_BASE || '') + '/api/products', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.products)
            });
            if (!res.ok) throw new Error('API save failed');
        } catch (e) {
            this.saveProducts();
        }
        return store.products.length < before;
    }
};

// 5. UI HELPERS

// Single source of truth for auth state — reads localStorage directly
// so it works on every page without depending on loadSession() timing.
function isLoggedIn() {
    try {
        var raw  = localStorage.getItem('hersstep_currentUser');
        var user = raw ? JSON.parse(raw) : null;
        return !!(user && (user.id || user.email));
    } catch (e) { return false; }
}

// Updates the nav bar auth links on every page:
//   logged in  → shows "Hi, Name" + Logout
//   logged out → shows Login + Sign Up
function updateNavAuth() {
    var authLinks = document.querySelector('.auth-links');
    if (!authLinks) return;
    if (isLoggedIn()) {
        var raw  = localStorage.getItem('hersstep_currentUser');
        var user = JSON.parse(raw);
        var name = (user.firstName || user.email || 'Account');
        authLinks.innerHTML =
            '<span style="color:var(--primary);font-weight:600;padding:0 0.5rem;">Hi, ' + name + '</span>' +
            '<a href="#" onclick="window.auth.logout();return false;">Logout</a>';
    } else {
        authLinks.innerHTML =
            '<a href="login.html">Login</a>' +
            '<a href="signup.html">Sign Up</a>';
    }
}

function updateCartCount() {
    const countEl = document.querySelector('.cart-count');
    if (!countEl) return;
    if (typeof cart !== 'undefined' && typeof cart.getItemCount === 'function') {
        const count = cart.getItemCount();
        countEl.textContent = count > 0 ? count : '';
        countEl.style.display = count > 0 ? 'flex' : 'none';
    }
}

function showNotification(message, type = 'success') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

function updateNav() {
    const orderItem = document.getElementById('order-nav-item');
    const orderLink = document.getElementById('order-nav-link');
    const dashItem = document.getElementById('dashboard-nav-item');
    
    // NEW: Target the back button
    const backBtn = document.getElementById('dynamic-order-btn');
    
    // Check if user is logged in
    if (store.currentUser) {
        // Navigation Bar Logic
        if (orderItem && orderLink) {
            orderItem.style.display = 'block';
            if (store.currentUser.role === 'staff') {
                orderLink.href = 'staff-orders.html';
            } else {
                orderLink.href = 'orders.html'; // Matches your specific link
            }
        }
        
        // Dashboard Logic
        if (dashItem) {
            dashItem.style.display = (store.currentUser.role === 'staff') ? 'block' : 'none';
        }

        // --- NEW: Back Button Logic ---
        if (backBtn) {
            backBtn.href = (store.currentUser.role === 'staff') ? 'staff-orders.html' : 'orders.html';
        }
    } else {
        // If not logged in, hide items
        if (orderItem) orderItem.style.display = 'none';
        if (dashItem) dashItem.style.display = 'none';
    }
}

// 6. EXPOSE TO WINDOW FOR GLOBAL ACCESS
window.store = store;
window.auth = auth;
window.products = products;
window.cart = cart;
window.showNotification = showNotification;
window.formatCurrency = formatCurrency;
window.isLoggedIn = isLoggedIn;
window.updateNavAuth = updateNavAuth;
// Orders service: simple localStorage-backed implementation used by payment simulator
const orders = {
    load: function() {
        // Keep orders in-memory by default. If a server API exists, try fetching.
        store.orders = store.orders || [];
    },
    save: async function() {
        // Attempt to persist to server if API endpoint exists; otherwise do nothing (no localStorage)
        if (!store.orders) store.orders = [];
        try {
            const res = await fetch((window.API_BASE || '') + '/api/orders', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.orders)
            });
            if (!res.ok) throw new Error('API save failed');
        } catch (e) {
            // Intentionally do not fall back to localStorage — orders persistence disabled
        }
    },
    // Promise-based loader to match pages expecting async
    loadOrders: async function() {
        // Prefer fetching from API if available
        try {
            const r = await fetch((window.API_BASE || '') + '/api/orders');
            if (r.ok) {
                const data = await r.json();
                store.orders = Array.isArray(data) ? data : [];
                return store.orders;
            }
        } catch (e) {
            // ignore network errors and keep in-memory orders
        }
        this.load();
        return Promise.resolve(store.orders);
    },
    getUserOrders: function() {
        if (!store.currentUser) return [];
        const uid = String(store.currentUser.id || store.currentUser.email);
        return (store.orders || []).filter(o => {
            const oid = o.userId != null ? String(o.userId) : (o.userEmail || '');
            return oid === uid;
        });
    },
    cancel: async function(orderId) {
        const ord = (store.orders || []).find(o => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));
        if (!ord) return false;
        if (ord.status === 'cancelled') return true;
        // Restore stock for items if possible
        if (Array.isArray(ord.items)) {
            ord.items.forEach(it => {
                try {
                    const prod = products.getById(it.id);
                    if (prod) {
                        prod.stock = (Number(prod.stock) || 0) + (Number(it.quantity) || 0);
                    }
                } catch (e) {}
            });
            // persist product changes
            products.saveProducts();
        }

        // Try to persist cancellation to server
        try {
            const r = await fetch((window.API_BASE || '') + '/api/orders/' + encodeURIComponent(ord.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
            if (r.ok) {
                try { const data = await r.json(); if (data && data.status) ord.status = data.status; else ord.status = 'cancelled'; } catch (e) { ord.status = 'cancelled'; }
                try { await this.save(); } catch (e) {}
                return true;
            }
        } catch (e) {
            // ignore and fallback
        }

        // Fallback to local update
        ord.status = 'cancelled';
        try { await this.save(); } catch (e) {}
        return true;
    },
    updateStatus: function(orderId, status) {
        const ord = (store.orders || []).find(o => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));
        if (!ord) return false;
        // Try server PATCH first
        return (async () => {
            try {
                const r = await fetch((window.API_BASE || '') + '/api/orders/' + encodeURIComponent(ord.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
                if (r.ok) {
                    try { const data = await r.json(); if (data && data.status) ord.status = data.status; else ord.status = status; } catch (e) { ord.status = status; }
                    return true;
                }
            } catch (e) {}
            ord.status = status;
            try { await this.save(); } catch (e) {}
            return true;
        })();
    },
    place: async function(pending) {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 150));
        const id = 'ORD-' + Date.now();
        const order = Object.assign({ id, createdAt: new Date().toISOString() }, pending);
        // Attach user identity if available
        if (store.currentUser) {
            order.userId = store.currentUser.id || store.currentUser.email;
            order.userEmail = store.currentUser.email || null;
        }
        // Default status and total
        order.status = order.status || 'placed';
        order.total = order.total || (cart.getTotal() - (order.discount || 0) + (cart.getTotal() >= 100 ? 0 : 9.99));
        // Ensure cart snapshot
        order.items = Array.isArray(store.cart) ? JSON.parse(JSON.stringify(store.cart)) : [];
        store.orders = store.orders || [];
        // Try to POST to server API first
        try {
            const r = await fetch((window.API_BASE || '') + '/api/orders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order)
            });
            if (r.ok) {
                const created = await r.json();
                store.orders.push(created);
                // Refresh products to reflect updated stock
                try { await products.loadProducts(); } catch (e) {}
                // Clear cart after successful order
                cart.clear();
                return created;
            }
        } catch (e) {
            // ignore and fallback to in-memory
        }

        // Fallback: keep in-memory order (no localStorage)
        store.orders.push(order);
        try { await this.save(); } catch (e) {}
        cart.clear();
        return order;
    }
};
orders.load();
window.orders = orders;
window.cart.loadCart();
if (typeof updateCartCount === 'function') updateCartCount();

// Run startup tasks
auth.loadSession();
cart.loadCart();
updateNavAuth();        // update nav on every page immediately
products.loadProducts();

document.addEventListener('DOMContentLoaded', updateNav);
setTimeout(() => {
    updateNav();
}, 100);