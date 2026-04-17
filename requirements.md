# Requirements

## Use Cases (Builder must implement all three flows)

### UC-1: Create Account
A customer registers a new account.

| Step | Action |
|------|--------|
| 1 | Customer clicks **Sign Up** and chooses email or phone number registration. |
| 2 | Customer fills in: first name, last name, age, email or phone number, password. |
| 3 | Customer clicks **Create Account**. |
| 4 | System validates input and checks that the email/phone is not already registered. |
| 5 | System creates the account and automatically logs the customer in. |

**Alternative:** Guest user adds items to cart, then creates an account during checkout and continues the purchase.

**Error:** If the email/phone already exists → show *"Account with this email/phone number already exists"* and block registration.

---

### UC-2: Place Order
A logged-in customer with items in their cart checks out.

| Step | Action |
|------|--------|
| 1 | Customer submits the order. |
| 2 | System compiles order details and sends a payment request. |
| 3 | Payment is processed successfully. |
| 4 | System updates the order status to placed. |
| 5 | System generates and shows an electronic receipt/confirmation to the customer. |

**Alternatives:**
- Customer applies a promo/discount code before placing the order; system recalculates the total.
- Customer changes payment method before placing the order.

**Errors:**
- Payment declined → show *"Payment Failed"*, order is not placed.
- Customer cancels at payment gateway, or item becomes unavailable → show *"Order has been cancelled"*.

---

### UC-3: Manage Product (Staff)
A logged-in staff member adds, edits, or removes products.

| Step | Action |
|------|--------|
| 1 | Staff clicks **Add** (new product) or **Modify** (existing product). |
| 2 | Staff fills in or updates: name, model, color, price, description. |
| 3 | Staff clicks **Save**. |
| 4 | System validates all fields. |
| 5 | System saves the product; it immediately appears on the storefront. |

**Alternative:** Staff updates the stock/inventory count for a product.

**Error:** Mandatory field left blank or negative price → show a red error message, block the save, catalog unchanged.

---

---

## Tester Checklist

Tester tests **only** the items in this checklist. Items marked **`[OUT OF SCOPE]`** must be **skipped entirely**.

---

### Customer — Account

| ID | What to test |
|----|-------------|
| C-01 | Sign Up page exists. Customer can register with: first name, last name, age, email or phone number, and password. |
| C-02 | Registering with a duplicate email/phone shows *"Account with this email/phone number already exists"* and blocks registration. |
| C-03 | Customer can log in with valid credentials. |
| C-04 | Customer can log out. |
| C-05 | A "Forgot Password / Reset Password" link exists on the login page and leads to a reset flow. |
| C-06 | Customer can view and edit their profile information (name, contact details, etc.). |

---

### Customer — Shopping & Cart

| ID | What to test |
|----|-------------|
| C-07 | Customer can browse a product listing page. |
| C-08 | Customer can filter products by model, color, and price. |
| C-09 | Customer can sort products by model, color, and price. |
| C-10 | Customer can add a product to the cart. |
| C-11 | Customer can increase or decrease item quantity in the cart. |
| C-12 | Customer can remove an item from the cart. |

---

### Customer — Checkout & Orders

| ID | What to test |
|----|-------------|
| C-13 | Customer can proceed to checkout from the cart. |
| C-14 | Customer can enter a discount/promo code at checkout and see the total update. |
| C-15 | Customer can select or change the payment method at checkout. |
| C-16 | Customer can place an order; a confirmation/receipt is shown on success. *(Mock payment — real processing is out of scope.)* |
| C-17 | A *"Payment Failed"* error is shown when payment is declined (simulated). |
| C-18 | An *"Order Cancelled"* message is shown when the order is cancelled (simulated). |
| C-19 | A guest user can create an account during the checkout step and continue the purchase. |
| C-20 | Customer can view their order history. |
| C-21 | Customer can view the current status of an individual order. |
| C-22 | Customer can cancel an order that has not yet been shipped. |
| C-23 | Customer can submit a return or refund request. *(UI/form only.)* |
| C-24 | Customer can submit an order dispute or complaint. *(UI/form only.)* |
| C-25 | Customer can contact staff about an order issue. *(UI/form or chat widget.)* |

---

### Customer — Notifications (On-Screen)

| ID | What to test |
|----|-------------|
| C-26 | An order confirmation message/receipt is displayed after a successful order. |
| C-27 | An order cancellation notification is displayed when an order is cancelled. |
| C-28 | A delivery notification is displayed when an order is marked as out for delivery (simulated status change). |

---

### Staff — Product Management

| ID | What to test |
|----|-------------|
| S-01 | Staff can log in with staff credentials. |
| S-02 | Staff can add a new product (name, model, color, price, description). |
| S-03 | Staff can update an existing product's details. |
| S-04 | Staff can remove a product. |
| S-05 | Staff can update the stock level for a product. |
| S-06 | Saving a product with a blank mandatory field or a negative price shows a red error message and blocks the save. |
| S-07 | A newly added or updated product is immediately visible on the customer-facing storefront. |

---

### Staff — Order Management

| ID | What to test |
|----|-------------|
| S-08 | Staff can view a list of incoming orders. |
| S-09 | Staff can search and filter orders. |
| S-10 | Staff can manually update an order's status. |
| S-11 | Staff can cancel an order on behalf of a customer. |
| S-12 | Staff can modify an order on behalf of a customer. |
| S-13 | Staff can view orders that are ready for packing. |
| S-14 | Staff can confirm an order as packed/ready. |
| S-15 | Staff can process a return or refund request. *(UI action only.)* |
| S-16 | Staff can handle a dispute or complaint. *(UI action only.)* |
| S-17 | Staff can send a message to a customer regarding an order issue. *(UI/form only.)* |

---

### Staff — Dashboard & Reports

| ID | What to test |
|----|-------------|
| S-18 | Staff can view a dashboard summary (e.g., total orders, revenue, recent activity). |
| S-19 | Staff can generate and view a sales report on screen. |

---

### Admin

| ID | What to test |
|----|-------------|
| A-01 | Admin can log in with admin credentials. |
| A-02 | Admin can create a new staff account. |
| A-03 | Admin can deactivate a staff account. |
| A-04 | Admin can view and edit existing staff accounts. |

---

### UI & Responsiveness

| ID | What to test |
|----|-------------|
| U-01 | All pages are usable on major browsers (Chrome, Firefox, Safari, Edge). *(Visual check.)* |
| U-02 | All customer-facing pages are usable on both desktop and mobile screen sizes. *(Resize/responsive check.)* |
| U-03 | Staff-facing pages are laid out for desktop use. |
| U-04 | Order and delivery status updates reflect correctly within the prototype when status changes (on action or refresh). |

---

### OUT OF SCOPE — Tester must skip all of these

| Requirement | Why it is skipped |
|-------------|------------------|
| SSL/TLS encryption for payment transmission | Cannot be verified by clicking through a prototype. |
| Order/payment processing accuracy < 1% error rate | Requires statistical load testing, not manual UI testing. |
| System available 24/7 excluding maintenance | Infrastructure/uptime concern, not UI. |
| Support 1,000+ concurrent users without degradation | Requires load testing tools (e.g., k6, JMeter). |
| Concurrent staff access without data conflicts | Requires multi-session backend testing. |
| Session timeouts for inactive staff accounts | Requires timed backend session testing. |
| Transaction logging and audit log retention | Backend/database concern, not visible in UI. |
| Data retention policy enforcement | Legal/backend concern. |
| GDPR/PDPA personal data protection compliance | Legal/audit concern, not testable in a prototype. |
| System updates and patches with minimal downtime | DevOps/deployment concern. |
| Scalability to 100,000 users | Infrastructure concern. |
| Export reports to PDF/CSV | Backend file generation; out of prototype scope. |
| External logistics system receives order details | External system integration, not testable standalone. |
| External logistics system sends delivery status updates | External system integration. |
| External payment system receives/confirms/notifies payment | Real integration is out of scope; prototype uses mock only. |