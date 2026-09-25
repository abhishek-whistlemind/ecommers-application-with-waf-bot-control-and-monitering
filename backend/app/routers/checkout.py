from fastapi import APIRouter, HTTPException, Request
from ..models.waf_event import OrderRequest
from ..database import db_get_product_by_id, db_decrement_stock, db_insert_order
import uuid
import time

router = APIRouter(prefix="/api/checkout", tags=["checkout"])

@router.post("")
async def process_checkout(order: OrderRequest, request: Request):
    """
    Protected checkout endpoint.
    If a request reaches here, it has passed AWS WAF Bot Control inspection.
    Stores confirmed order and updates inventory in SQLite database.
    """
    target_product = db_get_product_by_id(order.product_id)
    if not target_product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Attempt to atomically decrement stock in database
    success = db_decrement_stock(order.product_id, order.quantity)
    if not success:
        raise HTTPException(status_code=400, detail=f"Insufficient inventory. Only {target_product['stock']} items remaining!")

    order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    total_price = round(target_product["price"] * order.quantity, 2)
    timestamp = int(time.time())

    # Insert into SQLite orders table
    db_insert_order({
        "id": order_id,
        "product_id": target_product["id"],
        "product_name": target_product["name"],
        "quantity": order.quantity,
        "total_amount": total_price,
        "shipping_address": order.shipping_address,
        "timestamp": timestamp,
        "waf_protection": "Verified by AWS WAF Bot Control (Targeted Tier)"
    })

    return {
        "status": "SUCCESS",
        "order_id": order_id,
        "product_name": target_product["name"],
        "quantity": order.quantity,
        "total_amount": total_price,
        "estimated_delivery": "2-3 Business Days",
        "timestamp": timestamp,
        "waf_protection": "Verified by AWS WAF Bot Control (Targeted Tier)"
    }
