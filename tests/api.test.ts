import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.js";
let app: Awaited<ReturnType<typeof createApp>>;
let adminToken: string, staffToken: string, guestToken: string;
async function call(
  path: string,
  method: any = "GET",
  payload?: any,
  token = adminToken,
) {
  return app.inject({
    method,
    url: "/api" + path,
    payload,
    headers: token ? { authorization: "Bearer " + token } : {},
  });
}
before(async () => {
  app = await createApp(process.env.TEST_DATABASE_URL || ":memory:");
  await app.ready();
  for (const [email, set] of [
    ["admin", (s: string) => (adminToken = s)],
    ["staff", (s: string) => (staffToken = s)],
    ["guest", (s: string) => (guestToken = s)],
  ] as const) {
    const r = await call(
      "/login",
      "POST",
      { email: email + "@example.test", password: "Portfolio!2026" },
      "",
    );
    assert.equal(r.statusCode, 200, r.body);
    set(r.json().token);
  }
});
after(async () => {
  if (app) await app.close();
});
test("authentication, invalid login, and cross-origin rejection", async () => {
  assert.equal((await call("/me", "GET", undefined, "")).statusCode, 401);
  assert.equal(
    (
      await call(
        "/login",
        "POST",
        { email: "admin@example.test", password: "wrong" },
        "",
      )
    ).statusCode,
    401,
  );
  const r = await app.inject({
    method: "POST",
    url: "/api/logout",
    headers: {
      authorization: "Bearer " + adminToken,
      origin: "https://untrusted.test",
    },
  });
  assert.equal(r.statusCode, 403);
  assert.equal((await call("/me")).json().user.role, "admin");
});

test("inventory reservations are atomic, idempotent and cancellation restores once", async () => {
  const p = (
    await call("/products", "POST", {
      name: "اختبار مخزون",
      sku: "TEST-" + Date.now(),
      price: 1050,
      stock: 3,
    })
  ).json();
  assert.ok(p.id);
  const data = {
    customer: "عميل تجريبي",
    productId: p.id,
    qty: 2,
    key: "order-" + Date.now(),
  };
  const results = await Promise.all([
    call("/orders", "POST", data),
    call("/orders", "POST", { ...data, key: data.key + "other" }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const success = results.find((r) => r.statusCode === 200)!.json();
  const original =
    success.request_key === data.key
      ? data
      : { ...data, key: data.key + "other" };
  assert.equal((await call("/orders", "POST", original)).json().id, success.id);
  assert.equal(
    (await call("/orders", "POST", { ...original, qty: 1 })).statusCode,
    409,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await call("/orders/" + success.id, "PATCH", { status: "cancelled" }))
        .statusCode,
      200,
    );
  const state = (await call("/state")).json();
  assert.equal(state.products.find((x: any) => x.id === p.id).stock, 3);
  assert.equal(
    state.movements.filter((m: any) => m.product_id === p.id && m.delta === 2)
      .length,
    1,
  );
  assert.equal(
    (await call("/orders/" + success.id, "PATCH", { status: "processing" }))
      .statusCode,
    409,
  );
});
test("staff cannot create products or edit another member order; totals come from the server", async () => {
  assert.equal(
    (
      await call(
        "/products",
        "POST",
        { name: "منتج", sku: "BAD", price: 100, stock: 1 },
        staffToken,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("/products", "POST", {
        name: "منتج",
        sku: "BAD",
        price: 100,
        stock: -1,
      })
    ).statusCode,
    400,
  );
  const p = (
    await call("/products", "POST", {
      name: "اختبار سعر",
      sku: "PRICE-" + Date.now(),
      price: 1234,
      stock: 5,
    })
  ).json();
  const o = (
    await call(
      "/orders",
      "POST",
      {
        customer: "عميل تجربة",
        productId: p.id,
        qty: 2,
        key: "price-" + Date.now(),
        unit_price: 1,
      },
      staffToken,
    )
  ).json();
  assert.equal(o.unit_price, 1234);
  assert.equal(
    (
      await call(
        "/orders/" + o.id,
        "PATCH",
        { status: "processing" },
        guestToken,
      )
    ).statusCode,
    403,
  );
  await call("/orders/" + o.id, "PATCH", { status: "processing" });
  await call("/orders/" + o.id, "PATCH", { status: "completed" });
  const report = (await call("/report")).json();
  assert.ok(report.revenue >= 2468);
  assert.equal(
    (await call("/orders/" + o.id, "PATCH", { status: "cancelled" }))
      .statusCode,
    409,
  );
});

test("logging out revokes the bearer token", async () => {
  const login = await call(
    "/login",
    "POST",
    { email: "guest@example.test", password: "Portfolio!2026" },
    "",
  );
  const token = login.json().token;
  assert.equal((await call("/logout", "POST", {}, token)).statusCode, 200);
  assert.equal((await call("/me", "GET", undefined, token)).statusCode, 401);
});
