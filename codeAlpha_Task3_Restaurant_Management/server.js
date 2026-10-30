require("dotenv").config();
const express = require("express");
const db = require("./db");
const app = express();
app.use(express.json());

db.exec(`
CREATE TABLE IF NOT EXISTS menu_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '',
 price REAL NOT NULL CHECK(price >= 0), available INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS dining_tables (
 id INTEGER PRIMARY KEY AUTOINCREMENT, table_number INTEGER UNIQUE NOT NULL, seats INTEGER NOT NULL CHECK(seats > 0),
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','occupied'))
);
CREATE TABLE IF NOT EXISTS reservations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL,
 table_id INTEGER NOT NULL REFERENCES dining_tables(id), reservation_time TEXT NOT NULL,
 guests INTEGER NOT NULL CHECK(guests > 0), status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','cancelled','completed'))
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER REFERENCES dining_tables(id), customer_name TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','served','cancelled')),
 total REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 menu_item_id INTEGER NOT NULL REFERENCES menu_items(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price REAL NOT NULL CHECK(unit_price >= 0)
);
CREATE TABLE IF NOT EXISTS inventory (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, quantity REAL NOT NULL DEFAULT 0,
 unit TEXT NOT NULL DEFAULT 'units', low_stock_threshold REAL NOT NULL DEFAULT 5
);
`);

app.get("/", (_req,res) => res.json({service:"Restaurant Management API", endpoints:["/api/menu","/api/tables","/api/reservations","/api/orders","/api/inventory","/api/reports/daily-sales"]}));
app.get("/api/menu", (_req,res) => res.json(db.prepare("SELECT * FROM menu_items ORDER BY name").all()));
app.post("/api/menu", (req,res) => {
 const {name,description="",price,available=1}=req.body;
 if(!name || !Number.isFinite(price) || price<0) return res.status(400).json({error:"name and non-negative price are required"});
 const r=db.prepare("INSERT INTO menu_items(name,description,price,available) VALUES(?,?,?,?)").run(name.trim(),description,price,available?1:0);
 res.status(201).json(db.prepare("SELECT * FROM menu_items WHERE id=?").get(r.lastInsertRowid));
});
app.patch("/api/menu/:id", (req,res) => {
 const old=db.prepare("SELECT * FROM menu_items WHERE id=?").get(req.params.id);
 if(!old) return res.status(404).json({error:"Menu item not found"});
 const name=req.body.name ?? old.name, description=req.body.description ?? old.description, price=req.body.price ?? old.price, available=req.body.available === undefined ? old.available : (req.body.available?1:0);
 if(!name || !Number.isFinite(price) || price<0) return res.status(400).json({error:"Invalid menu item values"});
 db.prepare("UPDATE menu_items SET name=?,description=?,price=?,available=? WHERE id=?").run(name,description,price,available,old.id);
 res.json(db.prepare("SELECT * FROM menu_items WHERE id=?").get(old.id));
});
app.get("/api/tables", (_req,res) => res.json(db.prepare("SELECT * FROM dining_tables ORDER BY table_number").all()));
app.post("/api/tables", (req,res) => {
 const {table_number,seats}=req.body;
 if(!Number.isInteger(table_number)||!Number.isInteger(seats)||seats<1) return res.status(400).json({error:"table_number and positive seats integer are required"});
 try { const r=db.prepare("INSERT INTO dining_tables(table_number,seats) VALUES(?,?)").run(table_number,seats); res.status(201).json(db.prepare("SELECT * FROM dining_tables WHERE id=?").get(r.lastInsertRowid)); }
 catch(e){ if(String(e.code).startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({error:"Table number already exists"}); throw e; }
});
app.post("/api/reservations", (req,res) => {
 const {customer_name,customer_email,table_id,reservation_time,guests}=req.body;
 if(!customer_name||!customer_email||!reservation_time||!Number.isInteger(Number(table_id))||!Number.isInteger(guests)||guests<1) return res.status(400).json({error:"customer_name, customer_email, table_id, reservation_time and positive guests are required"});
 const table=db.prepare("SELECT * FROM dining_tables WHERE id=?").get(table_id);
 if(!table) return res.status(404).json({error:"Table not found"});
 if(guests>table.seats) return res.status(400).json({error:"Guest count exceeds table capacity"});
 const conflict=db.prepare("SELECT id FROM reservations WHERE table_id=? AND status='booked' AND reservation_time=?").get(table_id,reservation_time);
 if(conflict) return res.status(409).json({error:"Table already reserved at that time"});
 const r=db.prepare("INSERT INTO reservations(customer_name,customer_email,table_id,reservation_time,guests) VALUES(?,?,?,?,?)").run(customer_name,customer_email,table_id,reservation_time,guests);
 res.status(201).json(db.prepare("SELECT * FROM reservations WHERE id=?").get(r.lastInsertRowid));
});
app.get("/api/reservations", (_req,res) => res.json(db.prepare("SELECT r.*,t.table_number FROM reservations r JOIN dining_tables t ON t.id=r.table_id ORDER BY reservation_time").all()));
app.patch("/api/reservations/:id/cancel", (req,res) => {
 const r=db.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND status='booked'").run(req.params.id);
 if(!r.changes) return res.status(404).json({error:"Active reservation not found"});
 res.json({message:"Reservation cancelled"});
});
app.post("/api/inventory", (req,res) => {
 const {name,quantity,unit="units",low_stock_threshold=5}=req.body;
 if(!name||!Number.isFinite(quantity)||quantity<0||!Number.isFinite(low_stock_threshold)||low_stock_threshold<0) return res.status(400).json({error:"name, non-negative quantity and threshold are required"});
 try { const r=db.prepare("INSERT INTO inventory(name,quantity,unit,low_stock_threshold) VALUES(?,?,?,?)").run(name,quantity,unit,low_stock_threshold); res.status(201).json(db.prepare("SELECT * FROM inventory WHERE id=?").get(r.lastInsertRowid)); }
 catch(e){ if(String(e.code).startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({error:"Inventory item already exists"}); throw e; }
});
app.get("/api/inventory", (_req,res) => res.json(db.prepare("SELECT *, quantity <= low_stock_threshold AS low_stock FROM inventory ORDER BY name").all()));
app.patch("/api/inventory/:id", (req,res) => {
 const item=db.prepare("SELECT * FROM inventory WHERE id=?").get(req.params.id);
 if(!item) return res.status(404).json({error:"Inventory item not found"});
 const quantity=req.body.quantity;
 if(!Number.isFinite(quantity)||quantity<0) return res.status(400).json({error:"quantity must be a non-negative number"});
 db.prepare("UPDATE inventory SET quantity=? WHERE id=?").run(quantity,item.id);
 res.json(db.prepare("SELECT *, quantity <= low_stock_threshold AS low_stock FROM inventory WHERE id=?").get(item.id));
});
app.post("/api/orders", (req,res) => {
 const {table_id=null,customer_name="",items}=req.body;
 if(!Array.isArray(items)||items.length===0) return res.status(400).json({error:"items must be a non-empty array of {menu_item_id, quantity}"});
 const normalized=[];
 for(const item of items){
  if(!Number.isInteger(item.menu_item_id)||!Number.isInteger(item.quantity)||item.quantity<1) return res.status(400).json({error:"Each item needs integer menu_item_id and positive quantity"});
  const menu=db.prepare("SELECT * FROM menu_items WHERE id=? AND available=1").get(item.menu_item_id);
  if(!menu) return res.status(400).json({error:`Menu item ${item.menu_item_id} is unavailable or missing`});
  normalized.push({menu_item_id:menu.id,quantity:item.quantity,unit_price:menu.price});
 }
 const total=normalized.reduce((sum,i)=>sum+i.quantity*i.unit_price,0);
 const create=db.transaction(()=>{
  const order=db.prepare("INSERT INTO orders(table_id,customer_name,total) VALUES(?,?,?)").run(table_id,customer_name,total);
  const insert=db.prepare("INSERT INTO order_items(order_id,menu_item_id,quantity,unit_price) VALUES(?,?,?,?)");
  normalized.forEach(i=>insert.run(order.lastInsertRowid,i.menu_item_id,i.quantity,i.unit_price));
  return db.prepare("SELECT * FROM orders WHERE id=?").get(order.lastInsertRowid);
 });
 res.status(201).json(create());
});
app.get("/api/orders", (_req,res) => {
 const orders=db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
 res.json(orders.map(o=>({...o,items:db.prepare("SELECT oi.*,m.name FROM order_items oi JOIN menu_items m ON m.id=oi.menu_item_id WHERE oi.order_id=?").all(o.id)})));
});
app.patch("/api/orders/:id/status", (req,res) => {
 const allowed=["pending","preparing","ready","served","cancelled"];
 if(!allowed.includes(req.body.status)) return res.status(400).json({error:`status must be one of ${allowed.join(", ")}`});
 const r=db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);
 if(!r.changes) return res.status(404).json({error:"Order not found"});
 res.json(db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id));
});
app.get("/api/reports/daily-sales", (_req,res) => {
 const rows=db.prepare("SELECT date(created_at) AS day, COUNT(*) AS orders, ROUND(SUM(total),2) AS sales FROM orders WHERE status!='cancelled' GROUP BY date(created_at) ORDER BY day DESC").all();
 res.json(rows);
});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"Internal server error"});});
app.listen(Number(process.env.PORT||3003),()=>console.log(`Restaurant API running on port ${process.env.PORT||3003}`));
