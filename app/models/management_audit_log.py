from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.db.base import Base

class ManagementAuditLog(Base):
    __tablename__ = "management_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False) # e.g., "CREATE", "UPDATE", "DELETE"
    resource_type = Column(String, nullable=False) # e.g., "MODEL", "API_KEY"
    resource_id = Column(String, nullable=True) # ID or name
    details = Column(Text, nullable=True) # JSON or string description
    timestamp = Column(DateTime(timezone=True), server_default=func.now())