from sqlalchemy import Column, Integer, String, Boolean
from app.db.base import Base
from app.db.types import EncryptedString

class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False)
    description = Column(String, nullable=True)
    secret_token = Column(EncryptedString, nullable=True)
    is_active = Column(Boolean, default=True)