# Task 3 — Restaurant Management System

## Features
- Menu item create/list/update and availability flag.
- Dining table create/list with seat capacity.
- Reservations with capacity checks, same-time table conflict checks, and cancellation.
- Orders with validated menu items, computed totals, order items, and status updates.
- Inventory tracking with low-stock flags.
- Daily sales summary endpoint.

## Run
```bash
cp .env.example .env
npm install
npm start
```
API default: `http://localhost:3003`.

## Example workflow
1. `POST /api/menu` body `{"name":"Burger","description":"Beef burger","price":8.5}`
2. `POST /api/tables` body `{"table_number":1,"seats":4}`
3. `POST /api/orders` body `{"table_id":1,"customer_name":"Sara","items":[{"menu_item_id":1,"quantity":2}]}`
4. `GET /api/orders`, `PATCH /api/orders/1/status` body `{"status":"preparing"}`
5. `POST /api/reservations` body `{"customer_name":"Sara","customer_email":"sara@example.com","table_id":1,"reservation_time":"2026-11-20T19:00:00","guests":2}`
6. `POST /api/inventory` body `{"name":"Tomatoes","quantity":3,"unit":"kg","low_stock_threshold":5}`
7. `GET /api/inventory` and `GET /api/reports/daily-sales`.

Key endpoints: `GET/POST /api/menu`, `PATCH /api/menu/:id`, `GET/POST /api/tables`, `GET/POST /api/reservations`, `PATCH /api/reservations/:id/cancel`, `GET/POST /api/orders`, `PATCH /api/orders/:id/status`, `GET/POST/PATCH /api/inventory`, `GET /api/reports/daily-sales`.

This learning version does not include payment processing, ingredient-level automatic deductions, or authentication.
