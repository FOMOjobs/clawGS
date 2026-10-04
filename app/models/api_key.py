from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Table, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

api_key_guardrails = Table(
    "api_key_guardrails",
    Base.metadata,
    Column("api_key_id", Integer, ForeignKey("api_keys.id"), primary_key=True),
    Column("guardrail_id", Integer, ForeignKey("guardrail_policies.id"), primary_key=True),
    Column("sort_order", Integer, default=0)
)

class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    owner = Column(String, nullable=False)
    budget_limit = Column(Float, nullable=True) # USD or token count
    budget_used = Column(Float, default=0.0)
    rate_limit_rpm = Column(Integer, nullable=True) # Requests per minute
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    policies = relationship("GuardrailPolicy", secondary=api_key_guardrails, backref="api_keys", order_by="api_key_guardrails.c.sort_order")
