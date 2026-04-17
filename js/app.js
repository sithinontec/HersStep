// ========================================
// HersStep - Main Application Data & State
// ========================================

// 1. GLOBAL STATE DEFINITION
const store = {
    products: [],
    cart: [],
    users: [],
    orders: [],
    currentUser: null
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
        const existingItem = store.cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            store.cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity,
                stock: product.stock
            });
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
            item.quantity = newQuantity;
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
// FIX 2: loadProducts now calls window.renderProducts so each page can define
//         its own renderer. The old renderProducts in app.js is removed because
//         it looked for #product-grid which doesn't match any page's actual ID,
//         and it conflicted with the version defined in products.html.
const products = {
    loadProducts: function() {
        return fetch('/api/products')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    window.store.products = data;

                    // Call whichever renderProducts the current page has defined.
                    // index.html defines its own, products.html defines its own.
                    if (typeof window.renderProducts === 'function') {
                        window.renderProducts();
                    }
                }
            })
            .catch(err => console.error('Failed to load products:', err));
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

// 6. EXPOSE TO WINDOW FOR GLOBAL ACCESS
window.store = store;
window.auth = auth;
window.products = products;
window.cart = cart;
window.showNotification = showNotification;
window.formatCurrency = formatCurrency;
window.isLoggedIn = isLoggedIn;
window.updateNavAuth = updateNavAuth;
window.cart.loadCart();
if (typeof updateCartCount === 'function') updateCartCount();

// Run startup tasks
auth.loadSession();
cart.loadCart();
updateNavAuth();        // update nav on every page immediately
products.loadProducts();