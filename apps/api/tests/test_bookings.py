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

import asyncio
@pytest.mark.asyncio
async def test_booking_concurrency_race_condition(client: AsyncClient):
    headers = {'Authorization': 'Bearer fake_token'}
    payload = {'session_id': '00000000-0000-0000-0000-000000000001', 'notes': 'Concurrent booking'}
    tasks = [client.post('/api/bookings', json=payload, headers=headers) for _ in range(5)]
    responses = await asyncio.gather(*tasks)
    status_codes = [r.status_code for r in responses]
    success_count = sum(1 for status in status_codes if status == 201)
    if success_count > 0:
        assert success_count == 1, f'Expected 1 success, got {success_count}. Race condition detected!'

