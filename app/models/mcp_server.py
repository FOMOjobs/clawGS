from sqlalchemy import Column, Integer, String, Boolean, JSON, ForeignKey
from app.db.base import Base

class MCPServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    url = Column(String, nullable=False)
    auth_token = Column(String, nullable=True)
    whitelisted_tools = Column(JSON, default=list) # List of tool names
    is_active = Column(Boolean, default=True)
    block_template_id = Column(Integer, ForeignKey("block_templates.id"), nullable=True)
