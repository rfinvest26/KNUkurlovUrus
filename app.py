import os
import sqlite3
from datetime import datetime
from io import BytesIO

import requests as req_lib
import pandas as pd
from flask import Flask, jsonify, request, send_file
from fpdf import FPDF

DATABASE = "store.db"

# Токен з @CryptoBot → /pay. Для продакшену краще: export CRYPTO_BOT_TOKEN='...'
CRYPTO_BOT_TOKEN = os.environ.get(
    "CRYPTO_BOT_TOKEN",
    "537672:AAsiRfg3IY32PdjUwLKoashjacad0cEYYUf",
)
CRYPTO_PAY_API = "https://pay.crypt.bot/api"

app = Flask(__name__)


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            balance REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS manuals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            category TEXT,
            photo_url TEXT,
            price REAL,
            manual_link TEXT
        );
        CREATE TABLE IF NOT EXISTS cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            manual_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (manual_id) REFERENCES manuals(id)
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            total_price REAL NOT NULL,
            date TEXT NOT NULL,
            order_type TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shop_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            usdt_trc20_address TEXT NOT NULL DEFAULT ''
        );
        INSERT OR IGNORE INTO shop_config (id, usdt_trc20_address) VALUES (1, '');
        CREATE TABLE IF NOT EXISTS pending_crypto_topups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            amount_usd REAL NOT NULL,
            crypto_invoice_id INTEGER NOT NULL,
            payload TEXT NOT NULL,
            credited INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.commit()
    conn.close()


def migrate_db():
    conn = sqlite3.connect(DATABASE)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(manuals)")
    cols = {row[1] for row in cur.fetchall()}
    if cols and "manual_link" not in cols:
        cur.execute("ALTER TABLE manuals ADD COLUMN manual_link TEXT")
        conn.commit()
    cur.execute(
        "CREATE TABLE IF NOT EXISTS shop_config ("
        "id INTEGER PRIMARY KEY CHECK (id = 1),"
        "usdt_trc20_address TEXT NOT NULL DEFAULT '')"
    )
    cur.execute(
        "INSERT OR IGNORE INTO shop_config (id, usdt_trc20_address) VALUES (1, '')"
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_crypto_topups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            amount_usd REAL NOT NULL,
            crypto_invoice_id INTEGER NOT NULL,
            payload TEXT NOT NULL,
            credited INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.commit()
    conn.close()


init_db()
migrate_db()


_CRYPTO_HEADERS = {
    "Crypto-Pay-API-Token": CRYPTO_BOT_TOKEN,
    "Content-Type": "application/json",
}


@app.after_request
def _cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not email:
        return jsonify({"error": "email required"}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, email, balance FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    if row is None:
        cur.execute(
            "INSERT INTO users (email, balance) VALUES (?, 0)", (email,)
        )
        conn.commit()
        uid = cur.lastrowid
        balance = 0.0
    else:
        uid, _, balance = row["id"], row["email"], row["balance"]
    conn.close()
    return jsonify({"id": uid, "email": email, "balance": balance})


@app.post("/topup")
def topup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    amount = data.get("amount")
    if not email or amount is None:
        return jsonify({"error": "email and amount required"}), 400
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount"}), 400
    if amt <= 0:
        return jsonify({"error": "amount must be positive"}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET balance = balance + ? WHERE email = ?", (amt, email))
    if cur.rowcount == 0:
        conn.close()
        return jsonify({"error": "user not found"}), 404
    conn.commit()
    cur.execute("SELECT id, email, balance FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    return jsonify(dict(row))


@app.get("/shop_config")
def shop_config_public():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT usdt_trc20_address FROM shop_config WHERE id = 1")
    row = cur.fetchone()
    conn.close()
    return jsonify({"usdt_trc20_address": (row[0] if row else "") or ""})


@app.post("/admin/shop_config")
def admin_shop_config():
    d = request.get_json(silent=True) or {}
    addr = (d.get("usdt_trc20_address") or "").strip()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE shop_config SET usdt_trc20_address = ? WHERE id = 1", (addr,)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "usdt_trc20_address": addr})


@app.post("/crypto/create_invoice")
def crypto_create_invoice():
    if not CRYPTO_BOT_TOKEN:
        return jsonify({"error": "CRYPTO_BOT_TOKEN не заданий"}), 503
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip()
    amount = d.get("amount")
    if not email:
        return jsonify({"error": "email required"}), 400
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount"}), 400
    if amt <= 0:
        return jsonify({"error": "amount must be positive"}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM users WHERE email = ?", (email,))
    if cur.fetchone() is None:
        conn.close()
        return jsonify({"error": "user not found"}), 404
    conn.close()

    try:
        resp = req_lib.post(
            f"{CRYPTO_PAY_API}/createInvoice",
            headers=_CRYPTO_HEADERS,
            json={
                "asset": "USDT",
                "amount": f"{amt:.2f}",
                "description": f"Поповнення балансу {email}",
                "payload": email,
                "expires_in": 3600,
            },
            timeout=30,
        )
        data = resp.json()
    except Exception as e:
        return jsonify({"error": f"Помилка зв'язку з Crypto Bot: {e}"}), 502

    if not data.get("ok"):
        err = data.get("error") or {}
        msg = err.get("name") or err.get("message") or str(err)
        return jsonify({"error": msg, "details": data}), 502

    inv = data.get("result") or {}
    if isinstance(inv, list):
        inv = inv[0] if inv else {}
    inv_id = inv.get("invoice_id")
    if not inv_id:
        return jsonify({"error": "Crypto Bot не повернув invoice_id", "details": data}), 502

    pay_url = (
        inv.get("bot_invoice_url")
        or inv.get("pay_url")
        or inv.get("web_app_invoice_url")
        or inv.get("mini_app_invoice_url")
        or ""
    )

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO pending_crypto_topups
            (user_email, amount_usd, crypto_invoice_id, payload, credited)
        VALUES (?, ?, ?, ?, 0)
        """,
        (email, amt, int(inv_id), email),
    )
    pending_id = cur.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "pending_id": pending_id,
        "invoice_id": inv_id,
        "pay_url": pay_url,
        "amount": amt,
    })


@app.post("/crypto/check_invoice")
def crypto_check_invoice():
    """Перевірка статусу інвойсу за invoice_id (або pending_id для зворотної сумісності)."""
    if not CRYPTO_BOT_TOKEN:
        return jsonify({"error": "CRYPTO_BOT_TOKEN не заданий"}), 503
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip()
    # приймаємо як invoice_id так і pending_id (для старого фронту)
    invoice_id = d.get("invoice_id")
    pending_id = d.get("pending_id")
    if not email:
        return jsonify({"error": "email required"}), 400
    if invoice_id is None and pending_id is None:
        return jsonify({"error": "invoice_id required"}), 400

    conn = get_db()
    cur = conn.cursor()

    # знайти запис у pending_crypto_topups
    if invoice_id is not None:
        try:
            inv_id_int = int(invoice_id)
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "invalid invoice_id"}), 400
        cur.execute(
            "SELECT id, user_email, amount_usd, credited FROM pending_crypto_topups "
            "WHERE crypto_invoice_id = ? ORDER BY id DESC LIMIT 1",
            (inv_id_int,),
        )
    else:
        try:
            pid = int(pending_id)
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "invalid pending_id"}), 400
        cur.execute(
            "SELECT id, user_email, amount_usd, credited, crypto_invoice_id AS invoice_id "
            "FROM pending_crypto_topups WHERE id = ?",
            (pid,),
        )

    row = cur.fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "invoice not found"}), 404
    if row["user_email"] != email:
        conn.close()
        return jsonify({"error": "forbidden"}), 403

    if row["credited"]:
        cur.execute("SELECT balance FROM users WHERE email = ?", (email,))
        bal = float(cur.fetchone()["balance"])
        conn.close()
        return jsonify({"status": "paid", "credited": float(row["amount_usd"]), "balance": bal})

    real_inv_id = invoice_id if invoice_id is not None else row["invoice_id"]

    try:
        resp = req_lib.get(
            f"{CRYPTO_PAY_API}/getInvoices",
            headers=_CRYPTO_HEADERS,
            params={"invoice_ids": str(real_inv_id), "count": 1},
            timeout=30,
        )
        data = resp.json()
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Помилка зв'язку з Crypto Bot: {e}"}), 502

    if not data.get("ok"):
        err = data.get("error") or {}
        conn.close()
        return jsonify({"error": err.get("name") or "api error", "details": data}), 502

    res = data.get("result") or {}
    items = res if isinstance(res, list) else res.get("items") or []

    paid = any(
        int(it.get("invoice_id", 0)) == int(real_inv_id) and it.get("status") == "paid"
        for it in items
    )

    if not paid:
        conn.close()
        return jsonify({"status": "pending"})

    amt = float(row["amount_usd"])
    cur.execute("UPDATE users SET balance = balance + ? WHERE email = ?", (amt, email))
    cur.execute("UPDATE pending_crypto_topups SET credited = 1 WHERE id = ?", (row["id"],))
    conn.commit()
    cur.execute("SELECT balance FROM users WHERE email = ?", (email,))
    bal = float(cur.fetchone()["balance"])
    conn.close()
    return jsonify({"status": "paid", "credited": amt, "balance": bal})


# Зворотна сумісність зі старим фронтом
@app.post("/crypto/check_payment")
def crypto_check_payment_alias():
    return crypto_check_invoice()


@app.get("/manuals/categories")
def manual_categories():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT category FROM manuals
        WHERE category IS NOT NULL AND TRIM(category) != ''
        ORDER BY category COLLATE NOCASE
        """
    )
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@app.get("/manuals")
def list_manuals():
    search = (request.args.get("search") or "").strip()
    category = (request.args.get("category") or "").strip()
    min_p = request.args.get("min_price")
    max_p = request.args.get("max_price")
    conn = get_db()
    cur = conn.cursor()
    sql = "SELECT * FROM manuals WHERE 1=1"
    params = []
    if search:
        sql += " AND (title LIKE ? OR description LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like])
    if category:
        sql += " AND category = ?"
        params.append(category)
    if min_p is not None and str(min_p).strip() != "":
        try:
            sql += " AND price >= ?"
            params.append(float(min_p))
        except ValueError:
            pass
    if max_p is not None and str(max_p).strip() != "":
        try:
            sql += " AND price <= ?"
            params.append(float(max_p))
        except ValueError:
            pass
    sql += " ORDER BY id"
    cur.execute(sql, params)
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d.pop("manual_link", None)
        rows.append(d)
    conn.close()
    return jsonify(rows)


@app.get("/admin/manuals")
def admin_list_manuals():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM manuals ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@app.post("/cart")
def add_cart():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    manual_id = data.get("manual_id")
    quantity = data.get("quantity", 1)
    if not email or manual_id is None:
        return jsonify({"error": "email and manual_id required"}), 400
    try:
        mid = int(manual_id)
        qty = int(quantity)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid manual_id or quantity"}), 400
    if qty < 1:
        return jsonify({"error": "quantity must be >= 1"}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM manuals WHERE id = ?", (mid,))
    if cur.fetchone() is None:
        conn.close()
        return jsonify({"error": "manual not found"}), 404
    cur.execute(
        "SELECT id, quantity FROM cart WHERE user_email = ? AND manual_id = ?",
        (email, mid),
    )
    existing = cur.fetchone()
    if existing:
        cur.execute(
            "UPDATE cart SET quantity = quantity + ? WHERE id = ?",
            (qty, existing["id"]),
        )
    else:
        cur.execute(
            "INSERT INTO cart (user_email, manual_id, quantity) VALUES (?, ?, ?)",
            (email, mid, qty),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.delete("/cart/<path:email>/<int:cart_id>")
def delete_cart_item(email, cart_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM cart WHERE id = ? AND user_email = ?", (cart_id, email)
    )
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    if not deleted:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@app.get("/cart/<path:email>")
def get_cart(email):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.id AS cart_id, c.manual_id, c.quantity, m.title, m.price
        FROM cart c
        JOIN manuals m ON m.id = c.manual_id
        WHERE c.user_email = ?
        """,
        (email,),
    )
    items = []
    total = 0.0
    for r in cur.fetchall():
        line = float(r["quantity"]) * float(r["price"])
        total += line
        d = dict(r)
        d["line_total"] = line
        items.append(d)
    conn.close()
    return jsonify({"items": items, "total": total})


def _purchase_tx(cur, email, lines):
    """lines: [(manual_id, qty), ...]. Uses cursor cur; no commit. Raises ValueError."""
    details = []
    total = 0.0
    for mid, qty in lines:
        cur.execute(
            "SELECT id, title, price, manual_link FROM manuals WHERE id = ?",
            (mid,),
        )
        m = cur.fetchone()
        if m is None:
            raise ValueError("manual not found")
        total += float(m["price"]) * qty
        details.append((mid, qty, m))
    cur.execute("SELECT balance FROM users WHERE email = ?", (email,))
    u = cur.fetchone()
    if u is None:
        raise ValueError("user not found")
    if float(u["balance"]) < total:
        raise ValueError("insufficient balance")
    purchased = []
    for mid, qty, m in details:
        purchased.append(
            {
                "manual_id": mid,
                "title": m["title"],
                "quantity": qty,
                "manual_link": (m["manual_link"] or ""),
            }
        )
    cur.execute(
        "UPDATE users SET balance = balance - ? WHERE email = ?", (total, email)
    )
    cur.execute(
        "INSERT INTO orders (user_email, total_price, date, order_type) VALUES (?, ?, ?, ?)",
        (email, total, datetime.now().isoformat(), "manual"),
    )
    return total, purchased


@app.post("/buy")
def buy():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not email:
        return jsonify({"error": "email required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.manual_id, c.quantity
            FROM cart c
            WHERE c.user_email = ?
            """,
            (email,),
        )
        lines = [(int(r["manual_id"]), int(r["quantity"])) for r in cur.fetchall()]
        if not lines:
            return jsonify({"error": "cart is empty"}), 400
        try:
            total, purchased = _purchase_tx(cur, email, lines)
            cur.execute("DELETE FROM cart WHERE user_email = ?", (email,))
            conn.commit()
        except ValueError as e:
            conn.rollback()
            msg = str(e)
            if msg == "insufficient balance":
                cur.execute("SELECT balance FROM users WHERE email = ?", (email,))
                have = float(cur.fetchone()["balance"])
                cur.execute(
                    """
                    SELECT COALESCE(SUM(c.quantity * m.price), 0)
                    FROM cart c JOIN manuals m ON m.id = c.manual_id
                    WHERE c.user_email = ?
                    """,
                    (email,),
                )
                need = float(cur.fetchone()[0])
                return jsonify({"error": "insufficient balance", "need": need, "have": have}), 400
            return jsonify({"error": msg}), 400
    finally:
        conn.close()
    return jsonify({"ok": True, "paid": total, "purchased": purchased})


@app.post("/buy_one")
def buy_one():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    mid = data.get("manual_id")
    qty = data.get("quantity", 1)
    if not email or mid is None:
        return jsonify({"error": "email and manual_id required"}), 400
    try:
        mid = int(mid)
        qty = int(qty)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid manual_id or quantity"}), 400
    if qty < 1:
        return jsonify({"error": "quantity must be >= 1"}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        try:
            total, purchased = _purchase_tx(cur, email, [(mid, qty)])
            conn.commit()
        except ValueError as e:
            conn.rollback()
            msg = str(e)
            if msg == "insufficient balance":
                cur.execute("SELECT price FROM manuals WHERE id = ?", (mid,))
                r = cur.fetchone()
                price = float(r["price"]) if r else 0
                cur.execute("SELECT balance FROM users WHERE email = ?", (email,))
                have = float(cur.fetchone()["balance"])
                need = price * qty
                return jsonify({"error": "insufficient balance", "need": need, "have": have}), 400
            return jsonify({"error": msg}), 400
    finally:
        conn.close()
    return jsonify({"ok": True, "paid": total, "purchased": purchased})


@app.post("/admin/add_manual")
def admin_add_manual():
    d = request.get_json(silent=True) or {}
    required = ("title", "description", "category", "photo_url", "price", "manual_link")
    for k in required:
        if k not in d:
            return jsonify({"error": f"missing {k}"}), 400
    try:
        price = float(d["price"])
    except (TypeError, ValueError):
        return jsonify({"error": "invalid price"}), 400
    link = (d.get("manual_link") or "").strip()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO manuals (title, description, category, photo_url, price, manual_link) VALUES (?,?,?,?,?,?)",
        (d["title"], d["description"], d["category"], d["photo_url"], price, link),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id})


@app.delete("/admin/delete_manual/<int:mid>")
def admin_delete_manual(mid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM manuals WHERE id = ?", (mid,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if not deleted:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@app.get("/report/excel")
def report_excel():
    conn = get_db()
    df = pd.read_sql_query("SELECT * FROM orders", conn)
    conn.close()
    buf = BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    return send_file(
        buf,
        as_attachment=True,
        download_name="orders.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/report/pdf")
def report_pdf():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders")
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description] if cur.description else []
    conn.close()
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=8)
    w = 190 / max(len(cols), 1)
    for col in cols:
        pdf.cell(w, 8, str(col)[:20], border=1)
    pdf.ln()
    for r in rows:
        for v in r:
            pdf.cell(w, 8, str(v)[:24], border=1)
        pdf.ln()
    buf = BytesIO()
    out = pdf.output()
    if isinstance(out, (bytes, bytearray)):
        buf.write(bytes(out))
    else:
        buf.write(out.encode("latin-1"))
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name="orders.pdf", mimetype="application/pdf")


if __name__ == "__main__":
    app.run(debug=True)
