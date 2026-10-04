from app.db.session import SessionLocal
from app.models.api_key import APIKey

db = SessionLocal()
key = db.query(APIKey).first()
print(f"KEY: {key.key if key else 'None'}")
