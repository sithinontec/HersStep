// ========================================
// HersStep - Main Application Data & State
// ========================================

// Robust Response.json: return null for empty/non-JSON bodies to avoid parse errors
(function() {
    if (typeof Response !== 'undefined' && Response.prototype && !Response.prototype._safeJsonPatched) {
        Response.prototype._safeJsonPatched = true;
        const origJson = Response.prototype.json;
        Response.prototype.json = async function() {
            try {
                // use a clone so we don't consume the original body stream
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

// Helper to extract an error message from a possibly-null parsed JSON response
function extractError(data, fallback) {
    if (data && typeof data === 'object') {
        if (typeof data.error === 'string' && data.error) return data.error;
        if (typeof data.message === 'string' && data.message) return data.message;
        // sometimes APIs return { errors: ['msg'] }
        if (Array.isArray(data.errors) && data.errors.length) return String(data.errors[0]);
    }
    return fallback || 'Request failed';
}

// User Management
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
        // update local cache
        store.users = store.users || [];
        store.users.push(data);
        store.currentUser = data;
        this.saveSession();
        return data;
    },
    
    login: async function(email, password) {
        // Normalize and trim inputs to avoid whitespace/case issues
        const emailClean = String(email || '').trim().toLowerCase();
        const passClean = String(password || '');
        console.debug('auth.login: sending', { email: emailClean, passwordLen: passClean.length });
        const res = await fetch((window.API_BASE || '') + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailClean, password: passClean })
        });
        // Log raw response for debugging (use clone so we can still parse)
        try {
            const clone = res.clone();
            const txt = await clone.text();
            console.debug('auth.login response', { status: res.status, ok: res.ok, body: txt });
        } catch (e) {
            console.debug('auth.login response: failed to read body', e && e.message);
        }
        const data = await res.json();
        if (!res.ok) {
            console.debug('auth.login error data', data);
            throw new Error(extractError(data, 'Invalid email or password'));
        }
        store.currentUser = data;
        // cache user locally (without password)
        store.users = store.users || [];
        const existing = store.users.find(u => Number(u.id) === Number(data.id));
        if (!existing) store.users.push(data);
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
            try {
                store.currentUser = JSON.parse(saved);
            } catch (e) {
                // ignore parse errors
            }
        }
    },
    
    updateProfile: function(updates) {
        // updated to call server
        if (!store.currentUser) return false;
        return fetch((window.API_BASE || '') + '/api/users/' + store.currentUser.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        }).then(r => r.json()).then(data => {
            if (data && !data.error) {
                const userIndex = store.users.findIndex(u => u.id === store.currentUser.id);
                if (userIndex !== -1) store.users[userIndex] = data;
                store.currentUser = data;
                this.saveSession();
                return true;
            }
            return false;
        }).catch(() => false);
    },
    
    resetPassword: function(email) {
        // Call server-side reset endpoint (mock)
        return fetch((window.API_BASE || '') + '/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        }).then(r => r.json()).then(data => {
            if (data && !data.error) return true;
            throw new Error(extractError(data, 'Reset failed'));
        });
    }
};

// Cart Management
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
    
    remove: function(productId) {
        store.cart = store.cart.filter(item => item.id !== productId);
        this.saveCart();
        updateCartCount();
    },
    
    updateQuantity: function(productId, quantity) {
        const item = store.cart.find(item => item.id === productId);
        if (item) {
            if (quantity <= 0) {
                this.remove(productId);
            } else {
                item.quantity = quantity;
                this.saveCart();
            }
            updateCartCount();
        }
    },
    
    clear: function() {
        store.cart = [];
        this.saveCart();
        updateCartCount();
    },
    
    getTotal: function() {
        return store.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    },
    
    getItemCount: function() {
        return store.cart.reduce((count, item) => count + item.quantity, 0);
    },
    
    saveCart: function() {
        localStorage.setItem('hersstep_cart', JSON.stringify(store.cart));
    },
    
    loadCart: function() {
        const saved = localStorage.getItem('hersstep_cart');
        if (saved) {
            try {
                store.cart = JSON.parse(saved);
            } catch (e) {
                store.cart = [];
            }
        }
        updateCartCount();
    }
};

// Order Management
const orders = {
    place: async function(orderData) {
        const payload = {
            userId: store.currentUser ? store.currentUser.id : null,
            items: store.cart.map(i => ({ id: i.id, quantity: i.quantity })),
            total: orderData.total,
            discount: orderData.discount || 0,
            paymentMethod: orderData.paymentMethod,
            shippingAddress: orderData.shippingAddress
        };

        const res = await fetch((window.API_BASE || '') + '/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(extractError(data, 'Failed to place order'));

        // Server returned newOrder and already decremented stock in DB.
        store.orders.push(data);
        // Refresh local product list (to pick up updated stock)
        if (typeof products !== 'undefined' && typeof products.loadProducts === 'function') {
            await products.loadProducts();
        }

        if (typeof this.saveOrders === 'function') this.saveOrders();
        cart.clear();
        return data;
    },
    
    getUserOrders: function() {
        if (!store.currentUser) return [];
        return store.orders.filter(o => o.userId === store.currentUser.id);
    },
    
    getAllOrders: function() {
        return store.orders;
    },
    
    updateStatus: function(orderId, status) {
        const order = store.orders.find(o => o.id === orderId);
        if (order) {
            order.status = status;
            if (typeof this.saveOrders === 'function') this.saveOrders();
            return true;
        }
        return false;
    },
    
    cancel: function(orderId) {
        const order = store.orders.find(o => o.id === orderId);
        if (order && order.status === 'placed') {
            order.status = 'cancelled';
            // Restore stock
            order.items.forEach(item => {
                const product = store.products.find(p => p.id === item.id);
                if (product) {
                    product.stock += item.quantity;
                }
            });
            if (typeof this.saveOrders === 'function') this.saveOrders();
            return true;
        }
        return false;
    }
    ,
    saveOrders: function() {
        // Try server persistence; fallback to localStorage
        if (window.fetch) {
            fetch((window.API_BASE || '') + '/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(store.orders)
            }).catch(() => {
                try { localStorage.setItem('hersstep_orders', JSON.stringify(store.orders)); } catch (e) {}
            });
        } else {
            try { localStorage.setItem('hersstep_orders', JSON.stringify(store.orders)); } catch (e) {}
        }
    },
    loadOrders: function() {
        // Load from localStorage immediately
        try {
            const saved = localStorage.getItem('hersstep_orders');
            if (saved) store.orders = JSON.parse(saved);
        } catch (e) {
            store.orders = [];
        }
        // Fetch from server to refresh
        if (window.fetch) {
            return fetch((window.API_BASE || '') + '/api/orders')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) store.orders = data;
                    if (typeof renderOrders === 'function') try { renderOrders(); } catch (e) {}
                    return store.orders;
                }).catch(() => store.orders || []);
        }
        return Promise.resolve(store.orders || []);
    }
};

// Product Management (Staff)
const products = {
    getAll: function() {
        return store.products;
    },

    getById: function(id) {
        return store.products.find(p => p.id === Number(id));
    },

    add: async function(productData) {
        const payload = {
            name: productData.name,
            model: productData.model,
            color: productData.color,
            price: Number(productData.price) || 0,
            description: productData.description || '',
            stock: Number(productData.stock) || 0,
            image: productData.image || ''
        };
        const res = await fetch((window.API_BASE || '') + '/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(extractError(data, 'Failed to add product'));
        store.products.push(data);
        if (typeof this.saveProducts === 'function') this.saveProducts();
        return data;
    },

    update: async function(id, updates) {
        const payload = { ...updates };
        if (payload.price !== undefined) payload.price = Number(payload.price) || 0;
        if (payload.stock !== undefined) payload.stock = Number(payload.stock) || 0;
        const res = await fetch((window.API_BASE || '') + '/api/products/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) return false;
        const idx = store.products.findIndex(p => Number(p.id) === Number(id));
        if (idx !== -1) store.products[idx] = data;
        if (typeof this.saveProducts === 'function') this.saveProducts();
        return true;
    },

    remove: async function(id) {
        const res = await fetch((window.API_BASE || '') + '/api/products/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return false;
        const index = store.products.findIndex(p => p.id === Number(id));
        if (index !== -1) store.products.splice(index, 1);
        if (typeof this.saveProducts === 'function') this.saveProducts();
        return true;
    },

    validate: function(productData, excludeId) {
        const errors = [];

        if (!productData.name || productData.name.trim() === '') {
            errors.push('Product name is required');
        }

        if (!productData.model || productData.model.trim() === '') {
            errors.push('Model is required');
        }

        if (!productData.color || productData.color.trim() === '') {
            errors.push('Color is required');
        }

        // Price must be numeric and non-negative
        if (productData.price === undefined || isNaN(Number(productData.price)) || Number(productData.price) < 0) {
            errors.push('Price must be 0 or greater');
        }

        if (!productData.description || productData.description.trim() === '') {
            errors.push('Description is required');
        }

        // Stock should not be negative
        if (productData.stock !== undefined && (isNaN(Number(productData.stock)) || Number(productData.stock) < 0)) {
            errors.push('Stock cannot be negative');
        }

        // Check for duplicate product name (case-insensitive), excluding an optional product id
        if (productData.name && productData.name.trim() !== '') {
            const nameNormalized = productData.name.trim().toLowerCase();
            const duplicate = store.products.some(p => p.name && p.name.trim().toLowerCase() === nameNormalized && Number(p.id) !== Number(excludeId));
            if (duplicate) {
                errors.push('Product with this name already exists');
            }
        }

        return errors;
    },

    saveProducts: function() {
        // Attempt to persist to server; fallback to localStorage
        if (window.fetch) {
            fetch((window.API_BASE || '') + '/api/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(store.products)
            }).catch(() => {
                try { localStorage.setItem('hersstep_products', JSON.stringify(store.products)); } catch (e) {}
            });
        } else {
            try { localStorage.setItem('hersstep_products', JSON.stringify(store.products)); } catch (e) {}
        }
    },

    loadProducts: function() {
        // Load from localStorage immediately if present
        try {
            const saved = localStorage.getItem('hersstep_products');
            if (saved) {
                store.products = JSON.parse(saved);
            }
        } catch (e) {
            // ignore
        }

        // Try fetching from server and override when available
        if (window.fetch) {
            return fetch((window.API_BASE || '') + '/api/products')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data) && data.length > 0) {
                        // ensure compatibility: if items use 'category', map to 'model'
                        store.products = data.map(p => ({
                            id: p.id,
                            name: p.name,
                            model: p.model || p.category || 'Unspecified',
                            color: p.color || 'Unknown',
                            price: Number(p.price) || 0,
                            description: p.description || '',
                            stock: Number(p.stock) || 0,
                            image: p.image || 'https://via.placeholder.com/300x200?text=Product'
                        }));
                        // If page has render helpers, call them
                        if (typeof populateCategories === 'function') try { populateCategories(); } catch (e) {}
                        if (typeof renderProducts === 'function') try { renderProducts(); } catch (e) {}
                    }
                    return data;
                }).catch(() => []);
        }
        return Promise.resolve(store.products || []);
    }
};

// Initialize App
function initApp() {
    auth.loadSession();
    cart.loadCart();
    updateCartCount();
    updateNav();
}

// Update Cart Count Display
function updateCartCount() {
    const countEl = document.querySelector('.cart-count');
    if (countEl) {
        const count = cart.getItemCount();
        countEl.textContent = count > 0 ? count : '';
        countEl.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Update Navigation Based on User State
function updateNav() {
    const navContainer = document.querySelector('.nav-menu');
    if (!navContainer) return;
    
    const user = store.currentUser;
    const authLinks = navContainer.querySelector('.auth-links');
    if (authLinks) {
        // Determine prefix depending on whether we're in /pages/ or root
        const inPages = window.location.pathname.includes('/pages/') || window.location.href.includes('/pages/');
        const prefix = inPages ? '' : 'pages/';

        if (user) {
            let roleLinks = '';
            if (user.role === 'staff') {
                roleLinks = `<a href="${prefix}staff-dashboard.html">Dashboard</a>`;
            }

            // Show Orders link only for non-staff users
            const ordersLink = user.role === 'staff' ? '' : `<a href="${prefix}orders.html">Orders</a>`;
            authLinks.innerHTML = `
                <a href="${prefix}profile.html">${user.firstName}</a>
                ${ordersLink}
                ${roleLinks}
                <a href="#" onclick="auth.logout(); return false;">Logout</a>
            `;
        } else {
            authLinks.innerHTML = `
                <a href="${prefix}login.html">Login</a>
                <a href="${prefix}signup.html">Sign Up</a>
            `;
        }
    }

    // If a staff user is signed in, hide public Shop links to avoid showing storefront
    const curUser = store.currentUser;
    if (curUser && curUser.role === 'staff') {
        document.querySelectorAll('a[href*="products.html"]').forEach(a => {
            const li = a.closest('li');
            if (li) li.style.display = 'none'; else a.style.display = 'none';
        });
    }
}

// Show Notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Format Currency
function formatCurrency(amount) {
    return '$' + amount.toFixed(2);
}

// Preload session and cart immediately so inline page scripts can read store state
// Expose key modules on the window so inline page scripts (login/signup) can access them
window.store = store;
window.auth = auth;
window.products = products;
window.cart = cart;
window.orders = orders;
window.showNotification = showNotification;
window.formatCurrency = formatCurrency;

auth.loadSession();
// Load persisted products (if any)
if (typeof products !== 'undefined' && typeof products.loadProducts === 'function') products.loadProducts();
cart.loadCart();
orders.loadOrders();
updateCartCount();

// Initialize on DOM Load (run immediately if document already parsed)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
