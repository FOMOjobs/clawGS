from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base

class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False) # e.g., "gpt-4", "ollama/llama3"
    provider = Column(String, nullable=False) # e.g., "openai", "anthropic", "ollama"
    api_base = Column(String, nullable=True) # Custom URL for the model
    cost_center = Column(String, nullable=True) # Billing code / cost center
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    block_template_id = Column(Integer, ForeignKey("block_templates.id"), nullable=True)
