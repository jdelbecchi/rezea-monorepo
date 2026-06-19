import asyncio
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://postgres:postgres@rezea_postgres:5432/rezea"

def main():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        res = conn.execute(text("SELECT date, type, amount_cents FROM finance_transactions LIMIT 20"))
        print("finance_transactions:")
        for row in res:
            print(row)
            
        print("\nTotals May 2026:")
        res = conn.execute(text("SELECT type, SUM(amount_cents) FROM finance_transactions WHERE date >= '2026-05-01' AND date <= '2026-05-31' GROUP BY type"))
        for row in res:
            print(row)

if __name__ == "__main__":
    main()
