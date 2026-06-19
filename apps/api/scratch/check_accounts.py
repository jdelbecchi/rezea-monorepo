
import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import User, CreditAccount, Order

async def check():
    async with AsyncSessionLocal() as db:
        # Get all orders
        res = await db.execute(select(Order, User).join(User, Order.user_id == User.id))
        orders = res.all()
        
        print(f"Found {len(orders)} orders")
        for order, user in orders:
            # Check CreditAccount
            acc_res = await db.execute(
                select(CreditAccount).where(
                    CreditAccount.user_id == user.id,
                    CreditAccount.tenant_id == order.tenant_id
                )
            )
            account = acc_res.scalar_one_or_none()
            print(f"User: {user.first_name} {user.last_name}, Order ID: {str(order.id)[:8]}..., Tenant: {str(order.tenant_id)[:8]}...")
            if account:
                print(f"  -> Account found! Balance: {account.balance}")
            else:
                print(f"  -> NO ACCOUNT FOUND for this user/tenant combination")

if __name__ == "__main__":
    asyncio.run(check())
