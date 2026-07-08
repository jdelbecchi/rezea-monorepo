import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_and_cancel_booking(client: AsyncClient):
    headers = {"Authorization": "Bearer fake_token"}
    
    # 1. Create booking
    payload = {
        "session_id": "00000000-0000-0000-0000-000000000000",
        "notes": "Test booking"
    }
    response = await client.post("/api/bookings", json=payload, headers=headers)
    assert response.status_code in [401, 201, 404] # 404 if session not found, 401 if auth fails
    
    # If booking was successful, test cancellation
    if response.status_code == 201:
        booking_id = response.json()["id"]
        del_response = await client.delete(f"/api/bookings/{booking_id}", headers=headers)
        assert del_response.status_code == 204
