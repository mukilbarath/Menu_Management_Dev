## What we're building
 
A digital menu, ordering, and billing platform for cafes and hotels. A customer scans a QR code at their table, browses a categorized menu with photos and descriptions, optionally talks to a multilingual AI assistant about dishes, adds items and preference notes to a shared table cart, and places an order. Staff receive the order on a dedicated portal, move it through prep, and generate a bill that's sent to the customer once the order closes. Each table has its own QR so orders, notes, and bills never cross between tables.
 
This must be built **multi-tenant and secure from day one** — assume it will serve more than one restaurant, even if we launch with just one.
 
## Suggested stack (adjust if you have a strong preference)
 
- **Frontend**: Next.js (React) + Tailwind, PWA-enabled for offline resilience
- **Backend/DB**: Supabase (Postgres + Auth + Storage + Realtime) — use Row Level Security on every table
- **Payments**: Razorpay or Stripe (confirm which before implementing billing)
- **Messaging**: WhatsApp Business API (preferred over SMS — better rendering, no DLT/TRAI template friction) for bill delivery
- **Real-time**: Supabase Realtime or WebSockets for live order-status updates
## Core customer flow
 
1. Customer scans a QR encoding only `restaurant_id + table_id` (static, reprintable — no session data in the QR itself).
2. Scanning opens or joins an **active session for that table**. Show the table number on screen so the customer can confirm ("Ordering for Table 7").
3. Multiple phones at the same table share **one table cart**, not separate isolated carts.
4. Customer browses categories → dishes → adds items, optionally aided by the AI assistant, optionally attaching a note per item.
5. Order submits and moves through a visible status: `placed → accepted → preparing → served`.
6. Customer requests the bill or pays in-app; the session closes on payment.
## Data model requirements
 
- Categories (starters, mains, desserts, beverages, etc.)
- Dishes: name, price, photo, description
- Variants (half/full, sizes) — each with its own price
- Paid add-ons (extra cheese, extra shot, etc.)
- Structured modifier tags (less spicy, no onion/garlic, Jain, takeaway) as the primary preference mechanism — free text is a fallback, not the default
- Diet/allergen tags (veg/non-veg/egg, contains nuts/dairy/gluten/shellfish)
- Per-dish availability toggle (staff can mark "sold out" instantly)
- Time-based menu visibility (e.g., breakfast vs. dinner)
## Customer-facing features
 
- **AI assistant**, scoped strictly to this restaurant's menu data (ingredients, allergens) — it must never guess about allergens or ingredients outside what's in the database.
- Multilingual: **English is mandatory, plus at least one regional language**.
- Give the assistant tools, not just chat: `search_menu`, `get_dish_details`, `check_allergens`, `add_to_cart` — so it can act on the cart directly (e.g. "something spicy and vegetarian under ₹300").
- Must support follow-up questions about a dish.
- **Text chat fallback is mandatory** alongside voice — many customers won't want to talk out loud in a dining room.
- Per-dish notes: typed or voice-recorded. Voice notes must be transcribed and translated into the kitchen's working language before reaching staff; keep the audio attached as backup, not as the primary format staff read.
## Order lifecycle & staff portal
 
- Order states: `placed → accepted → preparing → served → billed → closed`, pushed live to both customer and staff.
- **Staff must confirm an order before the kitchen fires it** — this is the fraud/prank-order checkpoint, don't skip it.
- Kitchen Display: a separate item-level ticket view, distinct from the staff order-taker's table-level view.
- Roles: owner, manager, cashier, waiter, kitchen — each with different portal permissions.
- Audit log: every void, discount, and bill edit is logged with who/when.
- Staff can: add/edit dishes and categories, customize photos, toggle availability, generate bills.
- Service call buttons: call waiter, request water, request bill.
- Bulk menu import: parse an uploaded PDF/Excel menu into structured items rather than requiring manual entry.
- Analytics: best/worst sellers, dead items, peak hours, table turnaround time, log of AI assistant questions.
## Billing & payments
 
- Generate itemized bill; send to customer via WhatsApp once the order is marked complete.
- In-app UPI (or chosen gateway) payment — this is a priority feature, not a later add-on.
- Split bill by person or by item.
- Tax/pricing model: GST rate, packaging charges, service charge, discounts, rounding — confirm exact rules before implementing billing math.
## Non-functional requirements
 
- **Multi-tenancy**: tenant isolation on every query (Row Level Security keyed on `restaurant_id`), per-restaurant branding, no cross-tenant data leakage under any circumstance.
- **Security**: never trust a client-supplied `table_id` or `session_id` without server-side verification against the authenticated session; verify all payment webhook signatures; no secrets committed to the repo.
- **Offline resilience**: PWA that caches the menu and queues orders optimistically for spotty connectivity.
- **Design**: this must not look like a generic AI-generated template. Use a taste/design skill (e.g. Taste Skill's `design-taste-frontend`) for the customer menu, and keep the customer app and staff portal visually consistent with each other via a shared `DESIGN.md` (a skill like Impeccable can enforce this).
- **Photo pipeline**: fixed aspect-ratio cropping, compression, CDN delivery, lazy loading, sensible placeholders for missing photos.
- **QR tamper prevention**: always display the table number prominently for the customer to confirm; use tamper-evident QR stickers physically.
## Open decisions — ask me if these aren't already answered elsewhere in this repo
 
1. Single restaurant for now, or multi-tenant SaaS from the start? (Assume multi-tenant architecture regardless, per the requirement above — this decision affects onboarding/billing flow, not the schema.)
2. Is hotel room service in scope for v1, or table-only for now? (If in scope, generalize "table" into a broader "service point" — table / room / poolside — in the schema now.)
3. Which payment gateway and which messaging provider (WhatsApp Business API vendor) should I integrate first?
## What to do before writing any code
 
1. If anything above is ambiguous or blocks a concrete decision, ask me — otherwise proceed with the stated defaults.
2. Produce `implementation_plan.md` scoped **only** to the Phase 1 MVP below. Do not plan Phase 2/3 features yet.
3. Produce `task.md` breaking the MVP into reviewable subtasks.
4. Wait for my approval of both before implementing anything.
## Build order
 
**Phase 1 — MVP (plan this first):** Menu with categories → per-table QR → shared table cart → order sent to a staff screen → availability toggle → bill generation → UPI payment.
 
**Phase 2 — Operations layer:** Order state tracking, Kitchen Display, roles & audit log, service call buttons, analytics dashboard, bulk menu import.
 
**Phase 3 — AI assistant:** Multilingual voice assistant grounded in real menu data, informed by the questions customers actually asked during Phase 1.