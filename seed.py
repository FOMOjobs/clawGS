from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.model_config import ModelConfig
from app.models.api_key import APIKey
from app.models.guardrail import GuardrailPolicy
import uuid

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Add default model
    if not db.query(ModelConfig).filter_by(name="mock-model").first():
        model = ModelConfig(name="mock-model", provider="mock", is_default=True)
        db.add(model)
    
    # Add API key
    test_key = "sk-" + str(uuid.uuid4())
    if not db.query(APIKey).filter_by(owner="test").first():
        api_key = APIKey(key=test_key, owner="test", budget_limit=10.0)
        db.add(api_key)
        
    # Add Guardrail Policies
    if not db.query(GuardrailPolicy).filter_by(name="PII Check").first():
        pii_policy = GuardrailPolicy(
            name="PII Check",
            description="Blocks standard PII like SSNs and credit card numbers",
            target="pre-flight",
            type="regex",
            config={"pattern": r"\b\d{3}-\d{2}-\d{4}\b|\b(?:\d{4}[ -]?){3}\d{4}\b"},
            action="block"
        )
        db.add(pii_policy)
        
    if not db.query(GuardrailPolicy).filter_by(name="Prompt Injection").first():
        injection_policy = GuardrailPolicy(
            name="Prompt Injection",
            description="Blocks common prompt injection keywords",
            target="pre-flight",
            type="keyword",
            config={"keywords": ["ignore all previous instructions", "system prompt", "bypass"]},
            action="block"
        )
        db.add(injection_policy)
    
    db.commit()
    print(f"Database seeded. Test API Key: {test_key}")

if __name__ == "__main__":
    seed()
