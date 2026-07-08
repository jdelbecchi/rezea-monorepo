import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_user(client: AsyncClient):
    payload = {
        "email": "testuser@example.com",
        "password": "StrongPassword123!",
        "first_name": "Test",
        "last_name": "User",
        "phone": "0601020304",
        "tenant_slug": "demo"
    }
    response = await client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == payload["email"]
    assert "id" in data
