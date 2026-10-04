from sqlalchemy import Column, Integer, String, Boolean
from app.db.base import Base
from app.db.types import EncryptedString

class OIDCProvider(Base):
    __tablename__ = "oidc_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    client_id = Column(String, nullable=False)
    client_secret = Column(EncryptedString, nullable=False)
    discovery_url = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
