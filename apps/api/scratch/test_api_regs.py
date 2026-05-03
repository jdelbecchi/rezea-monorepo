
import requests

def test_api():
    # Login as admin
    login_url = "http://localhost:8000/api/auth/login"
    login_data = {"email": "admin@monclub.fr", "password": "password", "tenant_slug": "mon-club"}
    headers = {"X-Tenant-Slug": "mon-club"}
    
    session = requests.Session()
    resp = session.post(login_url, json=login_data, headers=headers)
    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        return
    
    token = resp.json()["access_token"]
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Slug": "mon-club"
    }
    
    # Get registrations
    regs_url = "http://localhost:8000/api/admin/event-registrations"
    resp = session.get(regs_url, headers=auth_headers)
    if resp.status_code != 200:
        print(f"Failed to get regs: {resp.text}")
        return
    
    regs = resp.json()
    print(f"Total registrations found: {len(regs)}")
    for r in regs:
        print(f"Reg: {r['event_title']} for {r['user_name']} status={r['status']}")

if __name__ == "__main__":
    test_api()
