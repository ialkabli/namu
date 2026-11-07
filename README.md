# نمو · NAMU

Inventory & order management. A standalone Arabic RTL portfolio application by **Abdulmajeed Hassan Kabli / عبدالمجيد حسن كابلي** (@iprigner).

![Desktop preview](docs/desktop.png)

## العربية

إدارة الطلبات والمخزون، من أول منتج حتى آخر طلب.

مشروع تجريبي للتعلم والعرض، وليس نظامًا مستخدمًا لدى عميل. يتضمن واجهة React وTypeScript وخادم Fastify وقاعدة بيانات PostgreSQL مضمّنة محليًا بواسطة PGlite. يمكن استخدام PostgreSQL خارجي عبر DATABASE_URL. لا يحتاج التشغيل الافتراضي إلى Docker أو حساب سحابي.

## Features

Atomic inventory reservation, idempotent order creation, server-side price snapshots, manager/staff authorization, one-time cancellation restocking, movement audit and revenue reporting.

## Run locally

Requires Node.js 24 LTS and npm. Run from this repository directory:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:8341**. The server binds to loopback only. Data persists under `data/database` (gitignored).

Demo accounts: `admin@example.test`, `staff@example.test`, `guest@example.test`. Default demo password: `Portfolio!2026`. These are public sample credentials, not personal credentials. DEMO_PASSWORD only affects initial creation; changing it does not reset existing passwords.

### Development

```sh
# terminal 1
npm run dev:server
# terminal 2
npm run dev
```

Open http://127.0.0.1:8441. Vite proxies API requests to the loopback server.

`.env.example` documents environment variables. `.env` is not loaded automatically: set variables in the shell, or use `node --env-file=.env --import tsx server/index.ts`. Never commit a real `.env` or database.

### External PostgreSQL

Use a dedicated empty PostgreSQL 17 database. Set DATABASE_URL before starting (PowerShell example):

```powershell
$env:DATABASE_URL='postgresql://portfolio:portfolio@127.0.0.1:5432/namu'
npm start
```

Schema is created idempotently at startup. Do not point the test suite at real application data; use a disposable empty database. Demo setup is the supported local workflow. User provisioning without demo seeding is outside this version.

## Verification

```sh
npm run check
```

Runs strict TypeScript checking, production bundling and API integration tests against the actual embedded PostgreSQL engine. Tests exercise authentication, authorization and the business rules below. GitHub Actions also defines a PostgreSQL 17 service job; its hosted run occurs only after you choose to push the repository. Local external-PostgreSQL execution is reported separately from embedded-engine results.

1. Login as admin. Add a product with stock 3.
2. Create an order for 2 units. Try another for 2: rejected.
3. Cancel the first order: stock returns to 3. Cancel again: unchanged.
4. Login as staff: product creation and restocking are forbidden.

## Engineering decisions

The stock decrement is a conditional database UPDATE inside the order transaction. A per-user idempotency advisory lock prevents duplicate submissions; cancellation locks the order row before restocking. Completed/cancelled orders cannot be reopened. Prices are integer halalas, not floating-point currency.

See [architecture and tradeoffs](docs/DECISIONS.md). No customer records or cloud credentials are bundled. Bearer tokens are held in memory and invalidated at logout. Refresh the browser to return to login.

## Scope and limitations

An order currently contains one product line. One store, not a multi-tenant commerce platform. No payment gateway, tax invoicing, returns after completion, or shipping integration. Reports cover all orders; UI lists the latest 200 orders and 100 movements.

These are portfolio implementations, not production deployments. This repository was prepared with AI coding assistance; the author should review the implementation and be able to explain and modify it during interviews. No professional-client or production-usage claim is implied.

## Repository layout

- `client/`: React RTL interface
- `server/`: Fastify routes, authentication, PostgreSQL transactions
- `tests/`: API and business-rule integration tests
- `docs/`: decisions, previews and interview notes
- `.github/workflows/check.yml`: reproducible checks

## Preparing for GitHub

Review the code and choose a license before publishing. `node_modules`, `data`, `dist`, `.env` and test output are ignored. No remote is configured by this preparation. Deployment is not required for reviewing source; screenshots and local setup instructions are provided.

## Browser smoke check

```sh
npx playwright install chromium
npm run test:ui
```

This starts a local server if needed and checks Arabic login, responsive layout and logout. The bundle additionally exercised the domain workflows described in its verification report. See [API contracts](docs/API.md).

## Interview notes بالعربية

اقرأ [شرح المشروع وسيناريو العرض والأسئلة](docs/INTERVIEW-AR.md).

![Mobile preview](docs/mobile.png)
