from pydantic import BaseModel
from typing import Optional
from datetime import date

class T(BaseModel):
    date: Optional[date] = None

try:
    print(T(date='2026-05-02'))
except Exception as e:
    print(e)
