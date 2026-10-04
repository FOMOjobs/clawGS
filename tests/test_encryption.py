import pytest
from sqlalchemy import create_engine, Column, Integer
from sqlalchemy.orm import declarative_base, sessionmaker
from app.db.types import EncryptedString
from app.core.encryption import fernet
from sqlalchemy import text

Base = declarative_base()

class DummyModel(Base):
    __tablename__ = 'test_encryption'
    id = Column(Integer, primary_key=True)
    secret = Column(EncryptedString)

def test_encrypted_string_type():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    tm = DummyModel(secret="my_super_secret_key")
    session.add(tm)
    session.commit()

    with engine.connect() as conn:
        res = conn.execute(text("SELECT secret FROM test_encryption")).scalar()
        assert res != "my_super_secret_key"
        assert res.startswith("gAAAAA") # fernet tokens typically start with this
        
        dec = fernet.decrypt(res.encode()).decode()
        assert dec == "my_super_secret_key"

    tm_db = session.query(DummyModel).first()
    assert tm_db.secret == "my_super_secret_key"
