import asyncio
import sys
import os

# Override DATABASE_URL for local execution on host Windows
os.environ["DATABASE_URL"] = "postgresql+asyncpg://rezea:rezea_password@127.0.0.1:5433/rezea"

# Ajout du chemin d'inclusion pour app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import AsyncSessionLocal
from app.api.finance import get_finance_dashboard
from fastapi import Request
from unittest.mock import Mock
from sqlalchemy import select
from app.models.models import Tenant

async def test_all_dashboards():
    async with AsyncSessionLocal() as db:
        # Get all tenants
        tenants = (await db.execute(select(Tenant))).scalars().all()
        if not tenants:
            print("No tenants found in the database.")
            return
        for t in tenants:
            print(f"Testing dashboard for tenant {t.name} (ID: {t.id})...")
            # Mock request
            mock_request = Mock(spec=Request)
            mock_request.state = Mock()
            mock_request.state.tenant_id = t.id
            try:
                res = await get_finance_dashboard(request=mock_request, db=db, current_user=None, month_str=None)
                print(f"Success for {t.name}!")
            except Exception as e:
                import traceback
                print(f"FAILED for {t.name}!")
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_all_dashboards())
