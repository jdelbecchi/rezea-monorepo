import asyncio
import json
import httpx
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, Order, User
from app.core.security import create_access_token

async def main():
    async with AsyncSessionLocal() as db:
        # Get first tenant
        tenant_res = await db.execute(select(Tenant).limit(1))
        tenant = tenant_res.scalar()
        if not tenant:
            print("No tenant found!")
            return
        print(f"Using Tenant: {tenant.name} ({tenant.slug}), ID: {tenant.id}")
        
        # Get owner or manager of this tenant
        user_res = await db.execute(select(User).where(User.role == "owner").limit(1))
        user = user_res.scalar()
        if not user:
            # fallback to any user
            user_res = await db.execute(select(User).limit(1))
            user = user_res.scalar()
        
        if not user:
            print("No user found!")
            return
        
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        print(f"Using User: {user.email}, Role: {role_str}, ID: {user.id}")
        
        # Find an order for this tenant
        order_res = await db.execute(select(Order).where(Order.tenant_id == tenant.id).limit(1))
        order = order_res.scalar()
        if not order:
            print("No order found!")
            return
        print(f"Using Order ID: {order.id}, start_date={order.start_date}, end_date={order.end_date}")
        
        token = create_access_token({"sub": str(user.id), "tenant_id": str(tenant.id), "role": role_str})
        
        # We will try to patch the order dates or activities
        payload = {
            "start_date": str(order.start_date),
            "end_date": str(order.end_date) if order.end_date else None,
            "status": order.status or "active",
            "payment_status": order.payment_status.value,
            "price_cents": order.price_cents,
            "featured_pricing": order.featured_pricing,
            "credits_total": int(order.credits_total) if order.credits_total is not None else None,
            "is_unlimited": order.is_unlimited,
            "comment": order.comment,
            "user_note": order.user_note,
            "is_blocked": order.is_blocked,
            "offer_snap_allowed_activities": ["Peinture"]
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-Slug": tenant.slug,
            "Content-Type": "application/json"
        }
        
        print("Sending payload:", json.dumps(payload, indent=2))
        
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"http://localhost:8000/api/admin/orders/{order.id}",
                json=payload,
                headers=headers
            )
            print("Status Code:", response.status_code)
            print("Response:", response.text)

if __name__ == "__main__":
    asyncio.run(main())
