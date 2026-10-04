from sqlalchemy import Column, Integer, String, Boolean, JSON
from app.db.base import Base

class GuardrailPolicy(Base):
    __tablename__ = "guardrail_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    target = Column(String)  # "pre-flight" or "post-flight"
    type = Column(String)  # "regex", "keyword", "model"
    config = Column(JSON)  # {"pattern": "...", "keywords": ["..."]}
    action = Column(String, default="block") # "block"
    is_active = Column(Boolean, default=True)
    is_global = Column(Boolean, default=False) # Applied to all requests if True
