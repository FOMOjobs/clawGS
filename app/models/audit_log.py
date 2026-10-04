from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float
from sqlalchemy.sql import func
from app.db.base import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), nullable=True, index=True)
    model_used = Column(String, nullable=False, index=True)
    cost_center = Column(String, nullable=True, index=True)
    tokens_prompt = Column(Integer, default=0)
    tokens_completion = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    action = Column(String, nullable=False, index=True) # e.g., "ALLOW", "BLOCK_PII", "BLOCK_BUDGET"
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    response_sent_at = Column(DateTime(timezone=True), nullable=True)
    gateway_processing_time_ms = Column(Float, default=0.0)
    llm_time_ms = Column(Float, default=0.0)
    request_payload = Column(String, nullable=True)
    response_payload = Column(String, nullable=True)
    guardrail_results = Column(String, nullable=True)
