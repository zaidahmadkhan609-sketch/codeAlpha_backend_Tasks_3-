const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();
const file = process.env.DATABASE_PATH || "app.db";
const db = new Database(path.resolve(file));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
module.exports = db;
