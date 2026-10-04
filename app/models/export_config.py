from sqlalchemy import Column, Integer, String
from app.db.base import Base

class ExportConfig(Base):
    __tablename__ = "export_configs"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, nullable=False)
