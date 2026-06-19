from pydantic import BaseModel
from typing import Optional
from datetime import date as py_date

class T(BaseModel):
    date: Optional[py_date] = None

try:
    print(T(date='2026-05-02'))
except Exception as e:
    print(e)
