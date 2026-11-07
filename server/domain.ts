import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DB } from "./db.js";
import { admin, fail, id } from "./auth.js";
const product = z.object({
  name: z.string().trim().min(2).max(100),
  sku: z.string().regex(/^[A-Z0-9-]{2,30}$/),
  price: z.number().int().min(1).max(100000000),
  stock: z.number().int().min(0).max(1000000),
});
const order = z.object({
  customer: z.string().trim().min(2).max(100),
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(10000),
  key: z.string().min(12).max(100),
});
export async function domain(app: FastifyInstance, db: DB) {
  await db.tx(async (q) => {
    await q(
      `CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,sku TEXT UNIQUE NOT NULL,price INT NOT NULL CHECK(price>0),stock INT NOT NULL CHECK(stock>=0));`,
    );
    await q(
      `CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer TEXT NOT NULL,product_id TEXT REFERENCES products(id),product_name TEXT NOT NULL,qty INT NOT NULL CHECK(qty>0),unit_price INT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','cancelled')),user_id TEXT REFERENCES users(id),request_key TEXT NOT NULL,created TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,request_key));`,
    );
    await q(
      `CREATE TABLE IF NOT EXISTS movements(id TEXT PRIMARY KEY,product_id TEXT REFERENCES products(id),delta INT NOT NULL,reason TEXT NOT NULL,actor TEXT REFERENCES users(id),created TIMESTAMPTZ DEFAULT NOW())`,
    );
    for (const [pid, name, sku, price, stock] of [
      ["p1", "سماعة لاسلكية", "NM-001", 24900, 28],
      ["p2", "حقيبة يومية", "NM-002", 18900, 16],
      ["p3", "كوب حراري", "NM-003", 8900, 4],
      ["p4", "مصباح مكتبي", "NM-004", 15900, 3],
    ])
      await q(
        "INSERT INTO products VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [pid, name, sku, price, stock],
      );
  });
  app.get("/api/state", async () =>
    db.tx(async (q) => ({
      products: await q("SELECT * FROM products ORDER BY sku"),
      orders: await q("SELECT * FROM orders ORDER BY created DESC LIMIT 200"),
      movements: await q(
        "SELECT m.*,p.name FROM movements m JOIN products p ON p.id=m.product_id ORDER BY created DESC LIMIT 100",
      ),
    })),
  );
  app.post("/api/products", async (req) => {
    admin(req.user);
    const b = product.parse(req.body);
    return db.tx(async (q) => {
      const pid = id();
      const [p] = await q(
        "INSERT INTO products VALUES($1,$2,$3,$4,$5) RETURNING *",
        [pid, b.name, b.sku, b.price, b.stock],
      );
      await q(
        "INSERT INTO movements(id,product_id,delta,reason,actor) VALUES($1,$2,$3,$4,$5)",
        [id(), pid, b.stock, "رصيد افتتاحي", req.user.id],
      );
      return p;
    });
  });
  app.post("/api/products/:id/restock", async (req) => {
    admin(req.user);
    const b = z
      .object({ qty: z.number().int().min(1).max(10000) })
      .parse(req.body);
    return db.tx(async (q) => {
      const [p] = await q(
        "UPDATE products SET stock=stock+$1 WHERE id=$2 AND stock+$1<=1000000 RETURNING *",
        [b.qty, (req.params as any).id],
      );
      if (!p) fail("المنتج غير موجود أو تجاوز حد المخزون", 404);
      await q(
        "INSERT INTO movements(id,product_id,delta,reason,actor) VALUES($1,$2,$3,$4,$5)",
        [id(), p.id, b.qty, "توريد مخزون", req.user.id],
      );
      return p;
    });
  });
  app.post("/api/orders", async (req) => {
    const b = order.parse(req.body);
    return db.tx(async (q) => {
      // Atomic conditional UPDATE is the stock reservation; no check-then-write race.
      await q("SELECT pg_advisory_xact_lock(hashtext($1))", [
        req.user.id + b.key,
      ]);
      const [existing] = await q(
        "SELECT * FROM orders WHERE user_id=$1 AND request_key=$2",
        [req.user.id, b.key],
      );
      if (existing) {
        if (
          existing.product_id !== b.productId ||
          existing.qty !== b.qty ||
          existing.customer !== b.customer
        )
          fail("المفتاح مستخدم لطلب مختلف", 409);
        return existing;
      }
      const [p] = await q(
        "UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING *",
        [b.qty, b.productId],
      );
      if (!p) fail("المخزون غير كافٍ أو المنتج غير موجود", 409);
      const [o] = await q(
        "INSERT INTO orders(id,customer,product_id,product_name,qty,unit_price,status,user_id,request_key) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING *",
        [id(), b.customer, p.id, p.name, b.qty, p.price, req.user.id, b.key],
      );
      await q(
        "INSERT INTO movements(id,product_id,delta,reason,actor) VALUES($1,$2,$3,$4,$5)",
        [id(), p.id, -b.qty, "حجز طلب " + o.id, req.user.id],
      );
      return o;
    });
  });
  app.patch("/api/orders/:id", async (req) => {
    const b = z
      .object({ status: z.enum(["processing", "completed", "cancelled"]) })
      .parse(req.body);
    return db.tx(async (q) => {
      const [o] = await q("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
        (req.params as any).id,
      ]);
      if (!o) fail("الطلب غير موجود", 404);
      if (req.user.role !== "admin" && o.user_id !== req.user.id)
        fail("غير مسموح بتعديل طلب عضو آخر", 403);
      if (o.status === b.status) return o;
      const allowed: Record<string, string[]> = {
        pending: ["processing", "cancelled"],
        processing: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[o.status].includes(b.status))
        fail("الانتقال بين حالتي الطلب غير مسموح", 409);
      if (b.status === "cancelled") {
        await q("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          o.qty,
          o.product_id,
        ]);
        await q(
          "INSERT INTO movements(id,product_id,delta,reason,actor) VALUES($1,$2,$3,$4,$5)",
          [id(), o.product_id, o.qty, "إلغاء طلب " + o.id, req.user.id],
        );
      }
      return (
        await q("UPDATE orders SET status=$1 WHERE id=$2 RETURNING *", [
          b.status,
          o.id,
        ])
      )[0];
    });
  });
  app.get("/api/report", async () =>
    db.tx(async (q) => {
      const [r] = await q(
        "SELECT COUNT(*)::int AS orders,COALESCE(SUM(qty*unit_price) FILTER (WHERE status='completed'),0)::text AS revenue FROM orders",
      );
      return {
        ...r,
        revenue: Number(r.revenue),
        lowStock: await q(
          "SELECT * FROM products WHERE stock<=5 ORDER BY stock",
        ),
      };
    }),
  );
}
