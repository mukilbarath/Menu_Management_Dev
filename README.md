# Digital Menu and Table Ordering

This project is a production-oriented restaurant ordering web app. A guest scans a fixed, resettable table QR code, verifies their phone number, joins the table cart, places an order, follows its status, requests service, and pays after dining. Takeaway guests verify their phone, order from `/takeaway/<restaurant-slug>`, and pay online before the order reaches the kitchen.

The app uses Next.js 16, React 19, Supabase Auth/Postgres/Realtime/Storage, Razorpay, Tailwind CSS, and a PWA service worker. Demo mode is available when Supabase is not configured.

## Current scope

- Phone OTP, secure table QR resolution, shared table cart, item notes, checkout, order status and service calls
- Staff login and role gates for owner, manager, cashier, waiter and kitchen users
- Live staff order board and kitchen display
- Dish/category creation, images, variants, add-ons, allergens, stock, time availability and atomic CSV import
- Automatic table QR generation, printing and reset with immediate invalidation
- Dine-in pay-later, takeaway pay-before-kitchen, Razorpay verification and cash/card counter settlement
- Configurable GST, service, packaging and rounding rules, plus equal, item and custom bill splits
- Tenant/session Row Level Security and transaction-safe ordering in `hardening.sql` and `production_migration.sql`

AI recommendations and voice ordering are intentionally outside the first release. WhatsApp delivery remains provider-dependent; MessageBird can be configured later without changing the order model.

## Database setup

For a new Supabase project, run these files in order in the SQL editor:

1. `database.sql`
2. `phase2_database.sql`
3. `fix_rls_and_cart.sql`
4. `hardening.sql`
5. `production_migration.sql`

Create the Supabase project in Mumbai (`ap-south-1`). Enable Phone Auth and configure an SMS provider; MessageBird is the current candidate and must also meet India DLT requirements. Create staff users in Supabase Auth, then add matching rows to `staff_profiles` with their restaurant and role. Set a unique lowercase `restaurants.slug` to enable its takeaway URL. Do not expose the service-role key in browser code.

Copy `.env.local.example` to `.env.local` and fill in the values. `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are server-only. Configure the Razorpay webhook URL as `/api/razorpay/webhook` for captured payment events.

## Vercel deployment

Import the repository into Vercel, add every value from `.env.local.example` as a Production environment variable, and deploy. `vercel.json` keeps server functions in Mumbai (`bom1`) close to the Supabase Mumbai database. Add the final Vercel URL to the Supabase Auth redirect allow-list before testing OTP in production.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Demo staff credentials are `admin@demo.com` / `password` only when the app is in demo mode.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The production build uses Webpack because the current PWA plugin integrates through Webpack. Private API, staff, order, payment and Supabase traffic is network-only in the service worker so sensitive or changing data is not served from cache.
