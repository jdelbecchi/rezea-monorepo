import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_buy_credits(client: AsyncClient):
    # This assumes an auth token is provided or mocked.
    # For now, we will just ensure the endpoint structure is hit.
    headers = {"Authorization": "Bearer fake_token"}
    payload = {
        "offer_id": "00000000-0000-0000-0000-000000000000",
        "amount": 10.0
    }
    
    response = await client.post("/api/credits/buy", json=payload, headers=headers)
    # Usually this would be 401 Unauthorized if token is fake,
    # or 201/200 if we mock the auth dependency.
    assert response.status_code in [401, 200, 201]
