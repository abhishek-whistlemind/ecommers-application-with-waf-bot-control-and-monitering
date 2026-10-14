#!/usr/bin/env python3
"""
Restore / Reset Database Utility for NexusCommerce
Restores the SQLite database to factory-fresh initial state:
  1. Resets product inventory back to original stock levels (7 GPUs, 12 Sneakers, etc.)
  2. Clears test purchase orders
  3. Clears simulated bot attack / WAF security event logs
  4. Resets demo user accounts (demo_customer, alex99, admin)
"""

import sqlite3
import os
import sys
import json
import urllib.request

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "nexus_commerce.db")

INITIAL_PRODUCTS = [
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

INITIAL_USERS = [
    ("demo_customer", "SecretPass123!", "customer"),
    ("alex99", "Shopping2026!", "customer"),
    ("admin", "SuperSecureWafAdmin99!", "admin")
]

def restore_database():
    print("\n" + "=" * 70)
    print("  RESTORING NEXUSCOMMERCE DATABASE TO FACTORY DEFAULTS")
    print("=" * 70)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Reset Products Table
    print("  [1/4] Restoring products inventory to initial stock...")
    cursor.execute("DROP TABLE IF EXISTS products")
    cursor.execute("""
    CREATE TABLE products (
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
    cursor.executemany("""
    INSERT INTO products (id, name, description, price, category, stock, image_url, is_flash_sale, rating, specs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, INITIAL_PRODUCTS)

    # 2. Reset Orders Table
    print("  [2/4] Resetting customer orders table...")
    cursor.execute("DROP TABLE IF EXISTS orders")
    cursor.execute("""
    CREATE TABLE orders (
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

    # 3. Reset Users Table
    print("  [3/4] Restoring default demo user accounts...")
    cursor.execute("DROP TABLE IF EXISTS users")
    cursor.execute("""
    CREATE TABLE users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer'
    )
    """)
    cursor.executemany("""
    INSERT INTO users (username, password, role) VALUES (?, ?, ?)
    """, INITIAL_USERS)

    # 4. Reset WAF Events Table
    print("  [4/4] Clearing WAF security telemetry events...")
    cursor.execute("DROP TABLE IF EXISTS waf_events")
    cursor.execute("""
    CREATE TABLE waf_events (
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

    conn.commit()
    conn.close()

    # Clear live server in-memory telemetry if backend is running
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/api/monitoring/clear", method="POST")
        urllib.request.urlopen(req, timeout=2)
        print("  [Sync] Live server in-memory WAF metrics cleared successfully.")
    except Exception:
        pass

    print("\n" + "=" * 70)
    print("  Database successfully restored!")
    print("  Products: 6 | Orders: 0 | Users: 3 | WAF Events: 0")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    restore_database()
