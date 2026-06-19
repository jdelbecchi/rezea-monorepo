import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token

def main():
    client = TestClient(app)
    # Generate token
    token = create_access_token({"sub": "efdd9ebc-bb74-4491-aceb-75f4c375a9a4", "tenant_id": "818653af-1fa8-44b4-8563-3b0c2ea12c80", "role": "owner"})
    
    payload = {
        "date": "2026-05-02",
        "type": "income",
        "category_id": None,
        "amount_cents": 1000,
        "vat_amount_cents": 0,
        "vat_rate": 0,
        "description": "Inscription Portes Ouvertes - Julien Membre",
        "payment_method": "other",
        "account_id": None
    }
    
    trans_id = "2396e9a1-63b5-4a16-9044-10703c35fdfd" # from logs
    
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Slug": "mon-club"}
    
    response = client.patch(f"/api/admin/finance/transactions/{trans_id}", json=payload, headers=headers)
    print("STATUS:", response.status_code)
    print("RESPONSE:", response.json())

if __name__ == "__main__":
    main()
