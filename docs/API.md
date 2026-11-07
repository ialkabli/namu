# API reference

All endpoints use `/api` prefix. JSON body requests need `Content-Type: application/json`. Protected endpoints require `Authorization: Bearer <token>`.

| Method | Route | Contract |
| --- | --- | --- |
| GET | /health | Public `{ok:true}` |
| POST | /login | Public `{email,password}` → `{token,user}`; 10 requests/minute per source IP |
| GET | /me | Current user |
| POST | /logout | Revoke current token |
| GET | /state | Product catalogue, latest 200 orders, latest 100 stock movements |
| GET | /report | Revenue from completed orders, total count, low stock |
| POST | /products | Admin: `{name,sku,price,stock}`; price in integer halalas |
| POST | /products/:id/restock | Admin: `{qty}` positive integer |
| POST | /orders | `{customer,productId,qty,key}`; key is an idempotency key |
| PATCH | /orders/:id | `{status}`; own order or admin; pending → processing → completed, or cancel before completion |

## Errors and limits

Errors use `{error: string}`. HTTP 400: invalid input; 401: missing/expired session; 403: forbidden role, owner mismatch or browser origin; 404: unavailable/missing resource; 409: state/uniqueness/concurrency conflict; 413: request too large; 429: rate limit; 500: generic server fault. Successful mutations currently return HTTP 200.

JSON request limit is 1 MB. This application does not expose a file-upload endpoint. Global request limit is 120/minute per source IP. The sample browser client keeps credentials in memory. No cross-origin API access is configured. Dates are validated by the server. All SQL values are parameterized.
