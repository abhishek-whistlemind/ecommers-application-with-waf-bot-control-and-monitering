import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "nexus_commerce.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes tables and seeds initial store products and demo accounts."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Products Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        stock INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        is_flash_sale BOOLEAN NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 4.8,
        specs TEXT NOT NULL
    )
    """)

    # 2. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        shipping_address TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        waf_protection TEXT NOT NULL
    )
    """)

    # 3. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer'
    )
    """)

    # 4. WAF Telemetry Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS waf_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        client_ip TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        waf_action TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        bot_category TEXT NOT NULL,
        token_status TEXT NOT NULL,
        token_id TEXT,
        telemetry_score REAL NOT NULL,
        status_code INTEGER NOT NULL,
        details TEXT NOT NULL
    )
    """)

    # Seed products if empty
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        initial_products = [
            (
                "prod-gpu-5090",
                "Apex CyberForce RTX 5090 Ti OC",
                "Next-gen Blackwell gaming powerhouse. 32GB GDDR7, DLSS 4.0 frame generation. Ultra-limited batch drop!",
                1999.99,
                "Hardware",
                7,
                "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=600&q=80",
                1,
                4.9,
                json.dumps(["32GB GDDR7", "PCIe 5.0", "Triple Vapor Chamber", "Boost Clock: 2850 MHz"])
            ),
            (
                "prod-sneaker-01",
                "AeroGlide Quantum 'Obsidian' Sneakers",
                "Exclusive sneaker drop with carbon-fiber lattice sole and adaptive kinetic cushioning.",
                320.00,
                "Footwear",
                12,
                "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
                1,
                4.8,
                json.dumps(["Carbon-Composite", "Limited Edition of 500", "Hand-Finished", "Serial Authenticated"])
            ),
            (
                "prod-phone-ultra",
                "Chronos Nova Pro Smartphone",
                "Titanium unibody flagship with quantum dot OLED display and all-day silicon battery.",
                1199.00,
                "Electronics",
                45,
                "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
                0,
                4.7,
                json.dumps(["Snapdragon 8 Gen 4", "512GB Storage", "120Hz LTPO", "5000mAh Battery"])
            ),
            (
                "prod-headphones-anc",
                "Vortex SoundStage ANC Wireless Headphones",
                "Planar magnetic drivers with lossless 96kHz audio transmission and active spatial noise cancellation.",
                389.99,
                "Audio",
                28,
                "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
                0,
                4.9,
                json.dumps(["Planar Drivers", "60hr Battery Life", "Adaptive ANC", "Leather Memory Foam"])
            ),
            (
                "prod-watch-cyber",
                "Aegis Horizon Smartwatch Series X",
                "Sapphire crystal smartwatch with ECG, dual-frequency GPS, and tactical battery life.",
                499.00,
                "Wearables",
                18,
                "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
                0,
                4.6,
                json.dumps(["Sapphire Glass", "100m Water Resistant", "Multi-band GPS", "Titanium Case"])
            ),
            (
                "prod-mechanical-kb",
                "CyberKey 75% Custom Magnetic Keyboard",
                "CNC machined aluminum chassis with Hall-effect magnetic switches and rapid trigger.",
                249.99,
                "Peripherals",
                34,
                "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80",
                0,
                4.9,
                json.dumps(["Hall-Effect Switches", "Rapid Trigger (0.1mm)", "Full RGB Backlit", "Gasket Mounted"])
            )
        ]
        cursor.executemany("""
        INSERT INTO products (id, name, description, price, category, stock, image_url, is_flash_sale, rating, specs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, initial_products)

    # Seed demo users if empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO users (username, password, role) VALUES (?, ?, ?)
        """, [
            ("demo_customer", "SecretPass123!", "customer"),
            ("alex99", "Shopping2026!", "customer"),
            ("admin", "SuperSecureWafAdmin99!", "admin")
        ])

    # Ensure all demo products have healthy inventory for bot attack simulation & checkout testing
    cursor.execute("UPDATE products SET stock = 50 WHERE stock < 5")

    conn.commit()
    conn.close()

# Initialize database on module load
init_db()

# DB Helper Functions
def db_reset_inventory():
    """Replenishes inventory for all demo products back to healthy stock levels."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE products SET stock = 50 WHERE stock < 10")
    conn.commit()
    conn.close()

def db_get_products(category: Optional[str] = None, flash_only: bool = False, search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM products WHERE 1=1"
    params = []

    if category and category.lower() != "all":
        query += " AND LOWER(category) = LOWER(?)"
        params.append(category)

    if flash_only:
        query += " AND is_flash_sale = 1"

    if search:
        query += " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)"
        params.append(f"%{search.lower()}%")
        params.append(f"%{search.lower()}%")

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    products = []
    for r in rows:
        d = dict(r)
        d["is_flash_sale"] = bool(d["is_flash_sale"])
        d["specs"] = json.loads(d["specs"]) if isinstance(d["specs"], str) else d["specs"]
        products.append(d)
    return products

def db_get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["is_flash_sale"] = bool(d["is_flash_sale"])
    d["specs"] = json.loads(d["specs"]) if isinstance(d["specs"], str) else d["specs"]
    return d

def db_decrement_stock(product_id: str, quantity: int) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT stock FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    current_stock = row["stock"]
    # In this demo environment, if inventory is depleted by test attacks, auto-replenish so checkout testing remains functional
    if current_stock < quantity:
        current_stock = 50
        cursor.execute("UPDATE products SET stock = 50 WHERE id = ?", (product_id,))

    cursor.execute("UPDATE products SET stock = ? - ? WHERE id = ?", (current_stock, quantity, product_id))
    conn.commit()
    conn.close()
    return True

def db_insert_order(order_data: Dict[str, Any]):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO orders (id, product_id, product_name, quantity, total_amount, shipping_address, timestamp, waf_protection)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        order_data["id"],
        order_data["product_id"],
        order_data["product_name"],
        order_data["quantity"],
        order_data["total_amount"],
        order_data["shipping_address"],
        order_data["timestamp"],
        order_data["waf_protection"]
    ))
    conn.commit()
    conn.close()

def db_get_user(username: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def db_create_user(username: str, password: str, role: str = "customer"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", (username, password, role))
    conn.commit()
    conn.close()

def db_insert_waf_event(event_dict: Dict[str, Any]):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO waf_events (
        id, timestamp, client_ip, method, path, user_agent, waf_action,
        rule_name, bot_category, token_status, token_id, telemetry_score, status_code, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_dict["id"],
        event_dict["timestamp"],
        event_dict["client_ip"],
        event_dict["method"],
        event_dict["path"],
        event_dict["user_agent"],
        event_dict["waf_action"],
        event_dict["rule_name"],
        event_dict["bot_category"],
        event_dict["token_status"],
        event_dict.get("token_id"),
        event_dict["telemetry_score"],
        event_dict["status_code"],
        event_dict["details"]
    ))
    conn.commit()
    conn.close()

def db_get_recent_waf_events(limit: int = 200) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM waf_events ORDER BY rowid DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def db_clear_waf_events():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM waf_events")
    conn.commit()
    conn.close()
