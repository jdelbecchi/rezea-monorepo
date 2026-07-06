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
        tenant_res = await db.execute(select(Tenant).limit(1))
        tenant = tenant_res.scalar()
        
        user_res = await db.execute(select(User).where(User.role == "owner").limit(1))
        user = user_res.scalar()
        
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        
        order_res = await db.execute(select(Order).where(Order.tenant_id == tenant.id).limit(1))
        order = order_res.scalar()
        
        token = create_access_token({"sub": str(user.id), "tenant_id": str(tenant.id), "role": role_str})
        
        # Send invalid payload (price_cents as string that is not an int)
        payload = {
            "price_cents": "invalid_string_value"
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-Slug": tenant.slug,
            "Content-Type": "application/json"
        }
        
        print("Sending invalid PATCH request...")
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"http://localhost:8000/api/admin/orders/{order.id}",
                json=payload,
                headers=headers
            )
            print("PATCH Status Code:", response.status_code)
            print("PATCH Response:", response.text)
            
    time.sleep(0.5)
    
    print("\nReading last 10 lines of docker logs:")
    res = subprocess.run(["docker", "logs", "rezea_api", "--tail", "10"], capture_output=True, text=True, errors="ignore")
    print(res.stdout + res.stderr)

if __name__ == "__main__":
    asyncio.run(main())
