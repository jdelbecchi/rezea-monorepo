import enum
class T(str, enum.Enum):
    I = 'income'

d = {'income': 1}
print(d.get(T.I))
