from fastapi import APIRouter, Request, Query
from typing import List, Optional
from ..models.waf_event import Product

router = APIRouter(prefix="/api/products", tags=["products"])

MOCK_PRODUCTS: List[Product] = [
    Product(
        id="prod-gpu-5090",
        name="Apex CyberForce RTX 5090 Ti OC",
        description="Next-gen Blackwell gaming powerhouse. 32GB GDDR7, DLSS 4.0 frame generation. Ultra-limited batch drop!",
        price=1999.99,
        category="Hardware",
        stock=7,
        image_url="https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=True,
        rating=4.9,
        specs=["32GB GDDR7", "PCIe 5.0", "Triple Vapor Chamber", "Boost Clock: 2850 MHz"]
    ),
    Product(
        id="prod-sneaker-01",
        name="AeroGlide Quantum 'Obsidian' Sneakers",
        description="Exclusive sneaker drop with carbon-fiber lattice sole and adaptive kinetic cushioning.",
        price=320.00,
        category="Footwear",
        stock=12,
        image_url="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=True,
        rating=4.8,
        specs=["Carbon-Composite", "Limited Edition of 500", "Hand-Finished", "Serial Authenticated"]
    ),
    Product(
        id="prod-phone-ultra",
        name="Chronos Nova Pro Smartphone",
        description="Titanium unibody flagship with quantum dot OLED display and all-day silicon battery.",
        price=1199.00,
        category="Electronics",
        stock=45,
        image_url="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=False,
        rating=4.7,
        specs=["Snapdragon 8 Gen 4", "512GB Storage", "120Hz LTPO", "5000mAh Battery"]
    ),
    Product(
        id="prod-headphones-anc",
        name="Vortex SoundStage ANC Wireless Headphones",
        description="Planar magnetic drivers with lossless 96kHz audio transmission and active spatial noise cancellation.",
        price=389.99,
        category="Audio",
        stock=28,
        image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=False,
        rating=4.9,
        specs=["Planar Drivers", "60hr Battery Life", "Adaptive ANC", "Leather Memory Foam"]
    ),
    Product(
        id="prod-watch-cyber",
        name="Aegis Horizon Smartwatch Series X",
        description="Sapphire crystal smartwatch with ECG, dual-frequency GPS, and tactical battery life.",
        price=499.00,
        category="Wearables",
        stock=18,
        image_url="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=False,
        rating=4.6,
        specs=["Sapphire Glass", "100m Water Resistant", "Multi-band GPS", "Titanium Case"]
    ),
    Product(
        id="prod-mechanical-kb",
        name="CyberKey 75% Custom Magnetic Keyboard",
        description="CNC machined aluminum chassis with Hall-effect magnetic switches and rapid trigger.",
        price=249.99,
        category="Peripherals",
        stock=34,
        image_url="https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80",
        is_flash_sale=False,
        rating=4.9,
        specs=["Hall-Effect Switches", "Rapid Trigger (0.1mm)", "Full RGB Backlit", "Gasket Mounted"]
    )
]

@router.get("", response_model=List[Product])
async def list_products(
    category: Optional[str] = None,
    flash_only: Optional[bool] = False,
    search: Optional[str] = None
):
    results = MOCK_PRODUCTS
    if category:
        results = [p for p in results if p.category.lower() == category.lower()]
    if flash_only:
        results = [p for p in results if p.is_flash_sale]
    if search:
        s = search.lower()
        results = [p for p in results if s in p.name.lower() or s in p.description.lower()]
    return results

@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: str):
    for p in MOCK_PRODUCTS:
        if p.id == product_id:
            return p
    return MOCK_PRODUCTS[0]
