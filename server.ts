import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("ledger.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'revenue' or 'expense'
    category TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL,
    currency TEXT DEFAULT 'USD',
    date TEXT NOT NULL,
    payment_status TEXT DEFAULT 'paid', -- 'paid', 'credit', 'partial'
    amount_paid REAL DEFAULT 0,
    counterparty TEXT,
    counterparty_contact TEXT,
    is_personal INTEGER DEFAULT 0,
    raw_text TEXT,
    status TEXT DEFAULT 'confirmed', -- 'confirmed', 'deleted', 'voided'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'void'
    old_value TEXT,
    new_value TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reconciliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    system_balance REAL NOT NULL,
    physical_balance REAL NOT NULL,
    variance REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS business_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    business_type TEXT,
    currency TEXT DEFAULT 'USD',
    setup_date DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add counterparty columns if they don't exist
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN counterparty TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN counterparty_contact TEXT").run();
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/transactions", (req, res) => {
    try {
      const transactions = db.prepare("SELECT * FROM transactions WHERE status != 'deleted' ORDER BY date DESC, created_at DESC LIMIT 100").all();
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/transactions", (req, res) => {
    try {
      const { type, category, item, amount, quantity, unit_price, currency, date, is_personal, raw_text, payment_status, amount_paid, counterparty, counterparty_contact } = req.body;
      
      const insert = db.prepare(`
        INSERT INTO transactions (type, category, item, amount, quantity, unit_price, currency, date, is_personal, raw_text, payment_status, amount_paid, counterparty, counterparty_contact)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const info = insert.run(
        type, category, item, amount, quantity || 1, unit_price || amount, 
        currency || 'USD', date, is_personal ? 1 : 0, raw_text, 
        payment_status || 'paid', amount_paid || (payment_status === 'paid' ? amount : 0),
        counterparty || null, counterparty_contact || null
      );

      db.prepare("INSERT INTO audit_logs (transaction_id, action, new_value) VALUES (?, ?, ?)")
        .run(info.lastInsertRowid, 'create', JSON.stringify(req.body));
        
      res.json({ id: info.lastInsertRowid, success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/stats", (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          SUM(CASE WHEN type = 'revenue' AND is_personal = 0 AND status = 'confirmed' THEN amount ELSE 0 END) as total_revenue,
          SUM(CASE WHEN type = 'expense' AND is_personal = 0 AND status = 'confirmed' THEN amount ELSE 0 END) as total_expenses,
          SUM(CASE WHEN type = 'capital' AND status = 'confirmed' THEN amount ELSE 0 END) as total_capital,
          SUM(CASE WHEN type = 'loan' AND status = 'confirmed' THEN amount ELSE 0 END) as total_loans,
          SUM(CASE WHEN type = 'refund' AND status = 'confirmed' THEN amount ELSE 0 END) as total_refunds,
          SUM(CASE WHEN is_personal = 1 AND status = 'confirmed' THEN amount ELSE 0 END) as total_personal,
          SUM(CASE WHEN payment_status = 'credit' AND type = 'revenue' AND status = 'confirmed' THEN (amount - amount_paid) ELSE 0 END) as accounts_receivable,
          SUM(CASE WHEN payment_status = 'credit' AND type = 'expense' AND status = 'confirmed' THEN (amount - amount_paid) ELSE 0 END) as accounts_payable,
          SUM(CASE 
            WHEN status = 'confirmed' THEN 
              CASE 
                WHEN type = 'revenue' THEN amount_paid
                WHEN type = 'expense' THEN -amount_paid
                WHEN type = 'capital' THEN amount_paid
                WHEN type = 'loan' THEN amount_paid
                WHEN type = 'refund' THEN amount_paid
                ELSE 0 
              END
            ELSE 0 
          END) as cash_balance
        FROM transactions
      `).get();
      
      const recentTrend = db.prepare(`
        SELECT date, SUM(CASE 
          WHEN type = 'revenue' THEN amount 
          WHEN type = 'refund' THEN amount
          WHEN type = 'expense' THEN -amount 
          ELSE 0 END) as net
        FROM transactions
        WHERE is_personal = 0 AND status = 'confirmed'
        GROUP BY date
        ORDER BY date DESC
        LIMIT 14
      `).all();

      res.json({ ...stats, recentTrend });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/reconcile", (req, res) => {
    try {
      const { physical_balance, system_balance, notes, date } = req.body;
      const variance = physical_balance - system_balance;
      const info = db.prepare(`
        INSERT INTO reconciliations (date, system_balance, physical_balance, variance, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(date, system_balance, physical_balance, variance, notes);
      res.json({ id: info.lastInsertRowid, success: true, variance });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/transactions/:id", (req, res) => {
    try {
      const old = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
      db.prepare("UPDATE transactions SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
      db.prepare("INSERT INTO audit_logs (transaction_id, action, old_value) VALUES (?, ?, ?)")
        .run(req.params.id, 'delete', JSON.stringify(old));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Explicitly serve index.html for SPA
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
