from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from ..models.waf_event import Product
from ..database import db_get_products, db_get_product_by_id

router = APIRouter(prefix="/api/products", tags=["products"])

@router.get("", response_model=List[Product])
async def list_products(
    category: Optional[str] = None,
    flash_only: Optional[bool] = False,
    search: Optional[str] = None
):
    products = db_get_products(category=category, flash_only=flash_only or False, search=search)
    return products

@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: str):
    product = db_get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
