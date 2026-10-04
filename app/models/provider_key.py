from sqlalchemy import Column, Integer, String
from app.db.base import Base
from app.db.types import EncryptedString

class ProviderKey(Base):
    __tablename__ = "provider_keys"

    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String, unique=True, index=True) # "openai", "anthropic", etc.
    api_key = Column(EncryptedString, nullable=False)
