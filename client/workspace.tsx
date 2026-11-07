import React, { useEffect, useState } from "react";
import { Heading, Metric, Empty, Field, money, date, type Props } from "./main";
const labels: Record<string, string> = {
  pending: "جديد",
  processing: "قيد التجهيز",
  completed: "مكتمل",
  cancelled: "ملغي",
};
export function Workspace({ api, user, notify }: Props) {
  const [state, setState] = useState<any>(null),
    [report, setReport] = useState<any>(null),
    [tab, setTab] = useState("orders"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const [customer, setCustomer] = useState(""),
    [pid, setPid] = useState("p1"),
    [qty, setQty] = useState(1),
    [key, setKey] = useState(crypto.randomUUID());
  const [name, setName] = useState(""),
    [sku, setSku] = useState(""),
    [price, setPrice] = useState(""),
    [stock, setStock] = useState(0);
  const [restock, setRestock] = useState<Record<string, number>>({});
  async function refresh() {
    const [s, r] = await Promise.all([api("/state"), api("/report")]);
    setState(s);
    setReport(r);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function act(work: () => Promise<any>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      notify(message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        tag="COMMERCE, IN FOCUS"
        title="نظرة تصنع الفرق."
        description="من حركة المخزون إلى الطلب المكتمل، تفاصيل متصلة بأرقام حقيقية."
      >
        <button
          className="secondary"
          disabled={busy}
          onClick={() => act(refresh, "تم تحديث البيانات")}
        >
          تحديث البيانات ↻
        </button>
      </Heading>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!state || !report ? (
        <div className="loading">جارٍ تحميل بيانات المتجر…</div>
      ) : (
        <>
          <div className="metrics">
            <Metric
              label="المبيعات المكتملة"
              value={money(report.revenue)}
              hint="من جميع الطلبات المكتملة"
            />
            <Metric
              label="إجمالي الطلبات"
              value={report.orders}
              hint="طلبات محفوظة في قاعدة البيانات"
            />
            <Metric
              label="مخزون منخفض"
              value={report.lowStock.length}
              hint="منتجات متبقي منها 5 قطع أو أقل"
            />
          </div>
          <div className="tabs">
            {[
              ["orders", "الطلبات"],
              ["products", "المنتجات والمخزون"],
              ["movements", "حركة المخزون"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "orders" && (
            <div className="split">
              <section className="panel">
                <div className="panel-heading">
                  <h2>سجل الطلبات</h2>
                  <input
                    aria-label="بحث الطلبات"
                    placeholder="ابحث باسم العميل…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {state.orders.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>العميل / المنتج</th>
                          <th>الإجمالي</th>
                          <th>الحالة</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.orders
                          .filter((o: any) => o.customer.includes(search))
                          .map((o: any) => (
                            <tr key={o.id}>
                              <td>
                                {o.customer}
                                <small>
                                  {o.product_name} × {o.qty}
                                </small>
                              </td>
                              <td>
                                {money(o.qty * o.unit_price)}
                                <small>{date(o.created)}</small>
                              </td>
                              <td>
                                <span
                                  className={
                                    "badge " +
                                    (o.status === "cancelled" ? "gray" : "")
                                  }
                                >
                                  {labels[o.status]}
                                </span>
                              </td>
                              <td>
                                <div className="actions">
                                  {(user.role === "admin" ||
                                    o.user_id === user.id) && (
                                    <>
                                      {o.status === "pending" && (
                                        <button
                                          className="secondary"
                                          disabled={busy}
                                          onClick={() =>
                                            act(
                                              () =>
                                                api(
                                                  "/orders/" + o.id,
                                                  "PATCH",
                                                  { status: "processing" },
                                                ),
                                              "الطلب قيد التجهيز",
                                            )
                                          }
                                        >
                                          تجهيز
                                        </button>
                                      )}
                                      {o.status === "processing" && (
                                        <button
                                          className="secondary"
                                          disabled={busy}
                                          onClick={() =>
                                            act(
                                              () =>
                                                api(
                                                  "/orders/" + o.id,
                                                  "PATCH",
                                                  { status: "completed" },
                                                ),
                                              "اكتمل الطلب",
                                            )
                                          }
                                        >
                                          إكمال
                                        </button>
                                      )}
                                      {["pending", "processing"].includes(
                                        o.status,
                                      ) && (
                                        <button
                                          className="danger"
                                          disabled={busy}
                                          onClick={() =>
                                            act(
                                              () =>
                                                api(
                                                  "/orders/" + o.id,
                                                  "PATCH",
                                                  { status: "cancelled" },
                                                ),
                                              "أُلغي الطلب وأُعيد المخزون",
                                            )
                                          }
                                        >
                                          إلغاء
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>لا توجد طلبات بعد. أنشئ أول طلب من النموذج.</Empty>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>طلب جديد</h3>
                  <span className="badge">حجز مخزون فوري</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await api("/orders", "POST", {
                        customer,
                        productId: pid,
                        qty,
                        key,
                      });
                      setCustomer("");
                      setQty(1);
                      setKey(crypto.randomUUID());
                    }, "أُنشئ الطلب وحُجزت الكمية");
                  }}
                >
                  <Field label="اسم العميل">
                    <input
                      value={customer}
                      onChange={(e) => {
                        setCustomer(e.target.value);
                        setKey(crypto.randomUUID());
                      }}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </Field>
                  <Field label="المنتج">
                    <select
                      value={pid}
                      onChange={(e) => {
                        setPid(e.target.value);
                        setKey(crypto.randomUUID());
                      }}
                    >
                      {state.products.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · متاح {p.stock}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الكمية">
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={qty}
                      onChange={(e) => {
                        setQty(Number(e.target.value));
                        setKey(crypto.randomUUID());
                      }}
                      required
                    />
                  </Field>
                  <button className="primary" disabled={busy}>
                    إنشاء الطلب ↖
                  </button>
                  <p className="hint">
                    السعر يُحسب على الخادم. إعادة إرسال الطلب نفسه لا تخصم
                    المخزون مرتين.
                  </p>
                </form>
              </section>
            </div>
          )}
          {tab === "products" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>المنتجات والمخزون</h2>
                  <small>الأسعار بالريال السعودي</small>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>المنتج</th>
                        <th>السعر</th>
                        <th>المتاح</th>
                        {user.role === "admin" && <th>توريد مخزون</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {state.products.map((p: any) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            <small>{p.sku}</small>
                          </td>
                          <td>{money(p.price)}</td>
                          <td>
                            <span
                              className={
                                "badge " + (p.stock <= 5 ? "warn" : "")
                              }
                            >
                              {p.stock} قطعة
                            </span>
                          </td>
                          {user.role === "admin" && (
                            <td>
                              <form
                                className="actions"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  act(
                                    () =>
                                      api(
                                        "/products/" + p.id + "/restock",
                                        "POST",
                                        { qty: restock[p.id] || 1 },
                                      ),
                                    "أُضيفت الكمية إلى المخزون",
                                  );
                                }}
                              >
                                <input
                                  aria-label={"كمية توريد " + p.name}
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={restock[p.id] || 1}
                                  onChange={(e) =>
                                    setRestock({
                                      ...restock,
                                      [p.id]: Number(e.target.value),
                                    })
                                  }
                                />
                                <button className="secondary" disabled={busy}>
                                  توريد
                                </button>
                              </form>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {user.role === "admin" && (
                <section className="panel">
                  <h3>إضافة منتج</h3>
                  <form
                    className="form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(async () => {
                        await api("/products", "POST", {
                          name,
                          sku,
                          price: Math.round(Number(price) * 100),
                          stock,
                        });
                        setName("");
                        setSku("");
                        setPrice("");
                        setStock(0);
                      }, "تمت إضافة المنتج");
                    }}
                  >
                    <Field label="اسم المنتج">
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field label="SKU">
                      <input
                        required
                        pattern="[A-Z0-9-]{2,30}"
                        dir="ltr"
                        value={sku}
                        onChange={(e) => setSku(e.target.value.toUpperCase())}
                      />
                    </Field>
                    <Field label="السعر بالريال">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max="1000000"
                        required
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </Field>
                    <Field label="الرصيد الافتتاحي">
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        required
                        value={stock}
                        onChange={(e) => setStock(Number(e.target.value))}
                      />
                    </Field>
                    <button className="primary" disabled={busy}>
                      حفظ المنتج
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
          {tab === "movements" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>سجل حركة المخزون</h2>
                <small>أحدث 100 حركة</small>
              </div>
              {state.movements.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>المنتج</th>
                        <th>التغير</th>
                        <th>السبب</th>
                        <th>التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.movements.map((m: any) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td dir="ltr">
                            {m.delta > 0 ? "+" : ""}
                            {m.delta}
                          </td>
                          <td>{m.reason}</td>
                          <td>{date(m.created)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>تظهر هنا عمليات التوريد وحجز الطلبات والإلغاء.</Empty>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
