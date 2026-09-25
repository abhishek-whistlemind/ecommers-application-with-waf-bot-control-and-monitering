#!/usr/bin/env python3
"""
Utility script to view data stored in the SQLite database (nexus_commerce.db).
Usage:
  python3 scripts/view_db.py          (shows summary of all tables)
  python3 scripts/view_db.py events   (shows latest WAF events)
  python3 scripts/view_db.py orders   (shows all placed orders)
  python3 scripts/view_db.py products (shows products and current stock)
  python3 scripts/view_db.py users    (shows registered user accounts)
"""

import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "nexus_commerce.db")

def print_separator(title=""):
    print("\n" + "=" * 80)
    if title:
        print(f"  {title}")
        print("=" * 80)

def view_events(limit=15):
    print_separator(f"LATEST {limit} WAF SECURITY EVENTS (Table: waf_events)")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
    SELECT timestamp, waf_action, bot_category, rule_name, client_ip, path
    FROM waf_events
    ORDER BY rowid DESC
    LIMIT ?
    """, (limit,))
    rows = c.fetchall()
    conn.close()

    if not rows:
        print("  No WAF events in database yet.")
        return

    print(f"  {'Time':<20} | {'Action':<10} | {'Category':<18} | {'Rule Triggered':<35}")
    print("  " + "-" * 78)
    for r in rows:
        action_colored = f"\033[92m{r[1]}\033[0m" if r[1] == "ALLOW" else f"\033[91m{r[1]}\033[0m"
        print(f"  {r[0]:<20} | {action_colored:<19} | {r[2]:<18} | {r[3]:<35}")

def view_orders():
    print_separator("CUSTOMER ORDERS (Table: orders)")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, product_name, quantity, total_amount, shipping_address, waf_protection FROM orders")
    rows = c.fetchall()
    conn.close()

    if not rows:
        print("  No orders placed yet.")
        return

    print(f"  {'Order ID':<14} | {'Product':<32} | {'Qty':<4} | {'Total':<10} | {'WAF Status'}")
    print("  " + "-" * 78)
    for r in rows:
        print(f"  {r[0]:<14} | {r[1]:<32} | {r[2]:<4} | ${r[3]:<9.2f} | {r[5]}")

def view_products():
    print_separator("PRODUCT INVENTORY (Table: products)")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, price, stock, is_flash_sale FROM products")
    rows = c.fetchall()
    conn.close()

    print(f"  {'ID':<18} | {'Name':<35} | {'Price':<10} | {'Stock':<6} | {'Target Drop'}")
    print("  " + "-" * 78)
    for r in rows:
        flash = "⚡ YES (High Bot Risk)" if r[4] else "No"
        print(f"  {r[0]:<18} | {r[1]:<35} | ${r[2]:<9.2f} | {r[3]:<6} | {flash}")

def view_users():
    print_separator("USER ACCOUNTS (Table: users)")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, password, role FROM users")
    rows = c.fetchall()
    conn.close()

    print(f"  {'Username':<20} | {'Password':<25} | {'Role':<10}")
    print("  " + "-" * 60)
    for r in rows:
        print(f"  {r[0]:<20} | {r[1]:<25} | {r[2]:<10}")

def view_all():
    print_separator("DATABASE SUMMARY (backend/nexus_commerce.db)")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    for table in ["products", "orders", "users", "waf_events"]:
        c.execute(f"SELECT COUNT(*) FROM {table}")
        count = c.fetchone()[0]
        print(f"  • Table '{table}': {count} records")
    conn.close()

    view_orders()
    view_products()
    view_events(10)

if __name__ == "__main__":
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
    if arg == "events":
        view_events(25)
    elif arg == "orders":
        view_orders()
    elif arg == "products":
        view_products()
    elif arg == "users":
        view_users()
    else:
        view_all()
