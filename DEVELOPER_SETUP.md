# PrepShip V2 — Developer Setup

Welcome. This guide gets you from zero to a running local environment.

---

## Prerequisites

- **Node.js 22+** (project uses `--experimental-strip-types` for TypeScript)
- **npm** (comes with Node)
- **Git**
- A terminal (macOS/Linux preferred)

---

## 1. Clone the Repo

```bash
git clone https://github.com/drprepperusa/prepship-v2.git
cd prepship-v2
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment

Create a `.env` file in the root:

```env
# API server port
API_PORT=4010

# Web proxy port
WEB_PORT=4011

# SQLite database path (use an absolute path)
SQLITE_DB_PATH=/path/to/your/prepship.db

# Database provider (always sqlite for local dev)
DB_PROVIDER=sqlite

# Session token — must match between API and web proxy
# Generate your own: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_TOKEN=your_session_token_here

# Enable the SS sync worker (set false if you don't have SS credentials)
WORKER_SYNC_ENABLED=false
```

---

## 4. Set Up Secrets

Create `secrets.json` in the root (get this from the team — it contains API keys):

```json
{
  "shipstation": {
    "api_key": "YOUR_SS_API_KEY",
    "api_secret": "YOUR_SS_API_SECRET",
    "api_key_v2": "YOUR_SS_V2_KEY"
  },
  "portal": {
    "jwt_secret": "any_random_string_for_local_dev"
  }
}
```

> **Note:** For local dev without ShipStation access, set `WORKER_SYNC_ENABLED=false` in `.env`. The app will run fine without real SS credentials — you can use the test order seeding script to populate data.

---

## 5. Initialize the Database with Mock Data

Run the mock environment setup script — it creates a fully self-contained dev database with realistic fake data. **No ShipStation credentials needed.**

```bash
node scripts/setup-mock-env.cjs
```

This creates `dev.db` in the project root with:
- **4 mock clients**: Acme E-Commerce, Seoul Kitchen Goods, SoCal Outdoor Supply, Test Orders
- **100 awaiting shipment orders** (30 per client) — ready for label creation testing
- **80 shipped orders** with real mock shipment records (carrier nicknames, tracking numbers, costs)
- **30 externally shipped orders** (show "Ext. Label" badge — Amazon/marketplace fulfilled)
- **SKU dimensions** pre-populated for rate shopping
- **Realistic tracking numbers** in correct UPS/USPS formats

Then update your `.env` to point at this database:
```env
SQLITE_DB_PATH=./dev.db
WORKER_SYNC_ENABLED=false
```

**Custom path:**
```bash
node scripts/setup-mock-env.cjs --db /path/to/your/dev.db
```

**Reset and re-seed:**
```bash
node scripts/setup-mock-env.cjs --clear
```

---

## 6. Run the Development Servers

You need two servers running simultaneously. Open two terminal tabs:

**Terminal 1 — API server (port 4010):**
```bash
npm run dev:api
```

**Terminal 2 — Web proxy (port 4011):**
```bash
npm run dev:web
```

Then open: **http://localhost:4011**

---

## Project Structure

```
apps/
  api/          # Node.js API server (TypeScript, --experimental-strip-types)
    src/
      app/      # HTTP routing, middleware
      modules/  # Feature modules (orders, labels, rates, queue, sync)
      common/   # Shared config (carrier accounts, SS config)
  web/          # Web proxy server (serves static files + proxies /api/* to API)
    public/     # Vanilla JS frontend (orders.js, batch.js, print-queue.js, etc.)
    src/        # Proxy server code

packages/
  contracts/    # Shared TypeScript types/interfaces (DTOs)
  shared/       # Shared utilities

scripts/
  seed-test-orders.cjs    # Seed 50 test orders for UI dev

tests/
  carrier-resolver.test.js   # Unit tests for carrier nickname logic
  column-display.test.js      # Integration tests for shipped order columns
```

---

## 7. Run Tests

```bash
# Unit tests (no running server needed)
node --experimental-strip-types --test tests/carrier-resolver.test.js

# Integration tests (requires API + web running on ports 4010/4011)
node --test tests/column-display.test.js
```

---

## 8. Key Concepts

### Authentication
- The web proxy injects a `SESSION_TOKEN` header on all `/api/*` requests
- Direct requests to port 4010 require `x-app-token: YOUR_SESSION_TOKEN`
- Requests through port 4011 require `x-session-token: YOUR_SESSION_TOKEN`

### Test Labels (Offline Mode)
- When creating labels with `testLabel: true`, the app skips ShipStation entirely
- Generates a fake tracking number (TEST + 20 digits), $0 cost, mock PDF
- Safe to use — never charges real postage

### Test Orders
- Test orders use clientId=11, storeId=999999, orderId range 9000001+
- Never synced to ShipStation
- Use these for all UI and print queue testing

### Sync Worker
- Polls ShipStation every 3 minutes when `WORKER_SYNC_ENABLED=true`
- Updates order statuses (shipped/cancelled) and saves shipment records
- Disable for local dev if you don't have SS credentials

---

## 9. Common Issues

**"Cannot find module" errors**
- Run `npm install` again
- Make sure you're on Node 22+: `node --version`

**Database locked errors**
- Only one process can write to SQLite at a time
- Stop all running servers before running migration scripts

**API returning 401**
- Check that `SESSION_TOKEN` in `.env` matches what the web proxy is using
- For direct API calls, use header `x-app-token: YOUR_SESSION_TOKEN`

**Orders not showing up**
- Check that `SQLITE_DB_PATH` points to the right database file
- Run the seed script: `node scripts/seed-test-orders.cjs`
- Select "Test Orders" from the Clients dropdown in the UI

---

## 10. Deployment (Production)

Production runs on a Mac Mini via launchd:
- API: `~/Library/LaunchAgents/com.prepshipv2.api.plist`
- Web: `~/Library/LaunchAgents/com.prepshipv2.web.plist`
- Tunneled via Cloudflare: `https://prepshipv2.drprepperusa.com`

Developers do **not** need to touch production. All changes go through GitHub — push to `main` and the production system is updated manually.

---

## Questions?

Ask in the **#prepship-v2** Discord channel. The AI agent there has full context on the codebase and can help with debugging, code review, and architecture questions.
