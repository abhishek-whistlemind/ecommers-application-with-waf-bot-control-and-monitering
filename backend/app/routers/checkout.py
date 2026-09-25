from fastapi import APIRouter, HTTPException, Request
from ..models.waf_event import OrderRequest
from .products import MOCK_PRODUCTS
import uuid
import time

router = APIRouter(prefix="/api/checkout", tags=["checkout"])

@router.post("")
async def process_checkout(order: OrderRequest, request: Request):
    """
    Protected checkout endpoint.
    If a request reaches here, it has passed AWS WAF Bot Control inspection.
    """
    target_product = next((p for p in MOCK_PRODUCTS if p.id == order.product_id), None)
    if not target_product:
        raise HTTPException(status_code=404, detail="Product not found")

    if target_product.stock < order.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient inventory. Only {target_product.stock} items remaining!")

    # Decrement stock to demonstrate inventory reservation
    target_product.stock -= order.quantity

    order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    total_price = round(target_product.price * order.quantity, 2)

    return {
        "status": "SUCCESS",
        "order_id": order_id,
        "product_name": target_product.name,
        "quantity": order.quantity,
        "total_amount": total_price,
        "estimated_delivery": "2-3 Business Days",
        "timestamp": int(time.time()),
        "waf_protection": "Verified by AWS WAF Bot Control (Targeted Tier)"
    }
