from sqlalchemy import Column, Integer, String, Boolean
from app.db.base import Base

class BlockTemplate(Base):
    __tablename__ = "block_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    model_name = Column(String, nullable=True) # If null, applies generally
    content = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)