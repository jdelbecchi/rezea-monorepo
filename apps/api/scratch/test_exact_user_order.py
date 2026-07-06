import asyncio
import json
import httpx
import subprocess
import time
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, Order, User
from app.core.security import create_access_token

async def main():
    async with AsyncSessionLocal() as db:
        order_id = "afaa9347-44a2-43b6-9efd-8bbba1f11f2c"
        order_res = await db.execute(select(Order).where(Order.id == order_id))
        order = order_res.scalar()
        if not order:
            print("Target order not found!")
            return
            
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == order.tenant_id))
        tenant = tenant_res.scalar()
        
        user_res = await db.execute(select(User).where(User.role == "owner").limit(1))
        user = user_res.scalar()
        
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        token = create_access_token({"sub": str(user.id), "tenant_id": str(tenant.id), "role": role_str})
        
        payload = {
            "start_date": "2026-06-15",
            "end_date": "2027-06-10",
            "price_cents": 50000,
            "featured_pricing": "lump_sum",
            "price_recurring_cents": None,
            "recurring_count": None,
            "period": None,
            "credits_total": 46,
            "is_unlimited": False,
            "status": "active",
            "payment_status": "paye",
            "comment": "",
            "user_note": "",
            "is_blocked": False,
            "offer_snap_allowed_activities": ["Peinture"]
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-Slug": tenant.slug,
            "Content-Type": "application/json"
        }
        
        print("Sending exact PATCH request...")
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"http://localhost:8000/api/admin/orders/{order.id}",
                json=payload,
                headers=headers
            )
            print("Status Code:", response.status_code)
            print("Response:", response.text)
            
    time.sleep(0.5)
    
    print("\nScanning docker logs for the error traceback...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    lines = logs.splitlines()
    # Let's find the last line containing 500 Internal Server Error
    idx = -1
    for i in range(len(lines) - 1, -1, -1):
        if "500 Internal" in lines[i]:
            idx = i
            break
            
    if idx == -1:
        # fallback to last line with greenlet or exception
        for i in range(len(lines) - 1, -1, -1):
            if "greenlet" in lines[i].lower() or "exception" in lines[i].lower():
                idx = i
                break
                
    if idx != -1:
        print(f"Error log found at line {idx}: {lines[idx]}")
        start = max(0, idx - 45)
        end = min(len(lines), idx + 5)
        for j in range(start, end):
            print(f"{j}: {lines[j]}")
    else:
        print("Could not find the error line in logs. Last 30 lines of logs:")
        for line in lines[-30:]:
            print(line)

if __name__ == "__main__":
    asyncio.run(main())
