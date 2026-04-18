# HerStep Online Shop - Prototype

A fully functional e-commerce website prototype for women's footwear. This repo contains a client-side, static prototype (no backend) used for testing UI flows, checkout, promo codes, and order persistence via browser storage.

## 🚀 Getting Started

### Opening the Prototype

You can run the prototype in two modes.

- Quick (file): open `index.html` directly in your browser (basic UI only).
- Recommended (server): run the bundled API + static server so the catalog and orders persist to a JSON database.

To run the API + static server:

```bash
cd server
npm install
npm start
# Then open http://localhost:3000 in your browser
```

Serving via the included server ensures frontend calls to `/api/*` work and data is persisted in `server/db.json`.

## 👤 Test Accounts

### Customer Account
- **Email:** customer@herstep.com
- **Password:** customer123

### Staff Account
- **Email:** staff@herstep.com
- **Password:** staff123

### Admin Account
- **Email:** admin@herstep.com
- **Password:** admin123  
_Note: Admin UI is not part of the current prototype; staff pages are included for product/order workflows._


## Promo codes

## SAVE10 -- 10% off

## WELCOME20 -- 20% off

## FIVEOFF -- $5 off

## 📁 Project Structure

```
HersStep/
├── index.html                 # Homepage
├── css/
│   ├── styles.css            # Main stylesheet
│   └── auth.css              # Authentication pages styles
├── js/
│   └── app.js                # Main application logic & data
├── pages/
│   ├── signup.html           # Customer registration
│   ├── login.html            # Login page
│   ├── forgot-password.html  # Password reset
│   ├── products.html         # Product catalog with filters
│   ├── cart.html             # Shopping cart
│   ├── checkout.html         # Checkout process
│   ├── order-confirmation.html  # Order confirmation
│   ├── orders.html           # Customer order history
│   ├── order-details.html    # Individual order view
│   ├── profile.html          # Customer profile
│   ├── about.html            # About page
│   ├── payment-sim.html      # Payment simulator (choose success/failure)
│   ├── staff-dashboard.html  # Staff dashboard
│   ├── staff-products.html   # Product management
│   ├── staff-orders.html     # Order management
│   └── staff-reports.html    # Sales reports
├── requirements.md           # Requirements specification
├── agent.md                  # Agent definitions
└── README.md                 # This file
```

## ✅ Implemented Features

### Customer Features (C-01 to C-28)
- ✅ Account registration with email/phone
- ✅ Login/logout functionality
- ✅ Forgot password flow
- ✅ Profile management
- ✅ Product browsing with filters and sorting
- ✅ Shopping cart management
- ✅ Checkout with promo codes
- ✅ Mock payment processing
- ✅ Order history and tracking
- ✅ Order cancellation
- ✅ Return/refund request UI
- ✅ Contact support forms
- ✅ Order notifications

### Staff Features
Staff pages are included for product and order management (read-only in this prototype). Admin UI is not included.

### UI/UX Features (U-01 to U-04)
- ✅ Responsive design (desktop & mobile)
- ✅ Modern, clean interface
- ✅ Real-time notifications
- ✅ Status updates reflect immediately

## 🎯 Testing Instructions

### For Testers

1. **Start Testing:** Open `index.html` in your browser (recommended: use Live Server for consistent behavior)
2. **Follow Checklist:** Use the Tester Checklist in `requirements.md`
3. **Report Issues:** Create/update `Mistakes.md` with any failures
4. **Test Customer Flow:** Staff/Admin UIs are not present in this prototype

### Test Scenarios

#### Customer Flow (checkout + payment simulator)
1. Register new account → C-01
2. Try duplicate email → C-02
3. Login → C-03
4. Browse products → C-07
5. Filter/sort products → C-08, C-09
6. Add to cart → C-10
7. Modify cart → C-11, C-12
8. Checkout with promo → C-13, C-14, C-15
9. Place order → C-16 (order placement now uses a payment simulator)
10. View order history → C-20
11. Cancel order → C-22

#### Staff Flow
1. Login as staff → S-01
2. Add new product → S-02
3. Edit product → S-03
4. Update stock → S-05
5. View orders → S-08
6. Update order status → S-10
7. Generate reports → S-19

#### Admin Flow
1. Login as admin → A-01
2. Create staff account → A-02
3. Deactivate staff → A-03

## 🎨 Design Features

- **Color Scheme:** Pink (#e91e63) primary with modern accents
- **Typography:** Segoe UI for clean, readable text
- **Responsive:** Mobile-first design with breakpoints
- **Components:** Cards, tables, modals, forms, notifications
- **Icons:** Emoji-based icons for visual appeal

## 🔧 Technical Details

- **Vanilla JavaScript:** No frameworks or libraries required
-- **localStorage:** Cart and user session are persisted in `localStorage` (keys: `hersstep_cart`, `hersstep_currentUser`). Orders are kept in-memory by default and will be sent to the server if an `/api/orders` endpoint is available.
- **Mock Data:** Pre-populated products and test accounts (staff/admin UI removed)
- **Client-Side Only:** No backend required for prototype

## 📝 Notes

- Payment processing is simulated via `pages/payment-sim.html` (you can choose success or failure to test flows)
- Promo codes available: `WELCOME10` (10% off), `SAVE20` (20% off), `FLAT15` ($15 off), `TEST50` (50% off — for testing)
- All main data is persisted to `localStorage`; clearing browser storage will remove saved carts, sessions and orders

## 🐛 Known Limitations

- No persistent backend database — data is scoped to the browser's `localStorage` and will be lost if cleared
- No real email sending
- No real payment processing (use the payment simulator to finalize orders)
- No file uploads for product images (emoji placeholders used)

## 📞 Support

For issues or questions about the prototype, please refer to the requirements in `requirements.md` or contact the development team.

---

**Version:** 1.0.1  
**Last Updated:** 2026-04-14
