from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.endpoints import gateway, management, auth, mcp, export
from app.db.session import engine
from app.db.base import Base

# Import models so they are registered with SQLAlchemy
from app.models import api_key, model_config, audit_log, guardrail, oidc_provider, provider_key, user, block_template, management_audit_log, webhook_config, mcp_server, export_config

# Create tables for SQLite
Base.metadata.create_all(bind=engine)

# Quick migration for new columns
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE model_configs ADD COLUMN api_base VARCHAR"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE model_configs ADD COLUMN cost_center VARCHAR"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN cost_center VARCHAR"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN response_sent_at DATETIME"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE guardrail_policies ADD COLUMN is_global BOOLEAN DEFAULT 0"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN gateway_processing_time_ms FLOAT DEFAULT 0.0"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN llm_time_ms FLOAT DEFAULT 0.0"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN request_payload TEXT"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN response_payload TEXT"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE audit_logs ADD COLUMN guardrail_results TEXT"))
        conn.commit()
    except Exception:
        pass



    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_model_used ON audit_logs(model_used)"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_cost_center ON audit_logs(cost_center)"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key_id ON audit_logs(api_key_id)"))
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(text("CREATE TABLE IF NOT EXISTS mcp_servers (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR NOT NULL UNIQUE, url VARCHAR NOT NULL, auth_token VARCHAR, whitelisted_tools JSON, is_active BOOLEAN DEFAULT 1)"))
        conn.commit()
    except Exception:
        pass

    # Migration for new columns if table already exists
    try:
        conn.execute(text("ALTER TABLE mcp_servers ADD COLUMN auth_token VARCHAR"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE mcp_servers ADD COLUMN whitelisted_tools JSON"))
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(text("ALTER TABLE api_key_guardrails ADD COLUMN sort_order INTEGER DEFAULT 0"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE mcp_servers ADD COLUMN block_template_id INTEGER"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE model_configs ADD COLUMN block_template_id INTEGER"))
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(text("CREATE TABLE IF NOT EXISTS webhook_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, url VARCHAR NOT NULL, description VARCHAR, secret_token VARCHAR, is_active BOOLEAN DEFAULT 1)"))
        conn.commit()
    except Exception:
        pass


    try:
        conn.execute(text("CREATE TABLE IF NOT EXISTS export_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, token VARCHAR NOT NULL)"))
        conn.commit()
    except Exception:
        pass



def generate_fake_data(db):
    print("Generating fake traffic data for the dashboard...")
    import random
    from datetime import datetime, timedelta, timezone
    import json
    
    # Ensure there's a provider and models
    models = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "gemini-1.5-pro", "mistral-large"]
    providers = ["openai", "openai", "anthropic", "gemini", "mistral"]
    cost_centers = ["HR-2026", "IT-SEC", "Engineering", "Marketing", "Executive"]
    
    for m, p in zip(models, providers):
        if not db.query(model_config.ModelConfig).filter(model_config.ModelConfig.name == m).first():
            mc = model_config.ModelConfig(name=m, provider=p, is_active=True, cost_center=random.choice(cost_centers))
            db.add(mc)
    db.commit()
    
    # Ensure we have keys to attribute traffic to
    owners = ["alice_dev", "bob_research", "charlie_prod", "diana_analytics", "mcp_agent"]
    keys = []
    for o in owners:
        key_obj = db.query(api_key.APIKey).filter(api_key.APIKey.owner == o).first()
        if not key_obj:
            key_obj = api_key.APIKey(key=f"clw_fake_{o}", owner=o, budget_limit=100.0, is_active=True)
            db.add(key_obj)
            db.commit()
            db.refresh(key_obj)
        keys.append(key_obj)
    
    # Generate 500 fake logs over the past 30 days
    actions = ["ALLOW"] * 85 + ["BLOCK_PRE_FLIGHT"] * 10 + ["BLOCK_RATE_LIMIT"] * 3 + ["BLOCK_POST_FLIGHT"] * 2
    now = datetime.now(timezone.utc)
    
    for _ in range(500):
        k = random.choice(keys)
        m = random.choice(models)
        
        if random.random() < 0.05:
            m = f"mcp_server_{random.randint(1, 3)}"
            
        a = random.choice(actions)
        
        days_ago = random.randint(0, 29)
        hours_ago = random.randint(0, 23)
        minutes_ago = random.randint(0, 59)
        
        fake_time = now - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)
        
        prompt_tokens = random.randint(10, 1500)
        completion_tokens = random.randint(0, 800) if a == "ALLOW" else 0
        
        cost = (prompt_tokens + completion_tokens) * 0.00002
        
        gw_time = random.uniform(5.0, 50.0)
        llm_time = random.uniform(100.0, 3500.0) if a == "ALLOW" else 0.0
        
        details_str = None
        if a != "ALLOW":
            failed_policy = random.choice(["Stop PII", "Anti-Jailbreak", "No Competitors", "High Risk ML"])
            details_str = json.dumps([{"name": failed_policy, "target": "pre-flight", "status": "fail"}])
            
        req_payload = json.dumps({
            "messages": [{"role": "user", "content": "Tell me a joke."}]
        })
        
        res_payload = None
        if a == "ALLOW":
            res_payload = json.dumps({
                "choices": [{"message": {"content": "Why did the chicken cross the road? To get to the other side!"}}]
            })
            
        log = audit_log.AuditLog(
            api_key_id=k.id,
            model_used=m,
            cost_center=random.choice(cost_centers),
            tokens_prompt=prompt_tokens,
            tokens_completion=completion_tokens,
            cost=cost,
            action=a,
            timestamp=fake_time,
            response_sent_at=fake_time + timedelta(milliseconds=gw_time+llm_time),
            gateway_processing_time_ms=gw_time,
            llm_time_ms=llm_time,
            request_payload=req_payload,
            response_payload=res_payload,
            guardrail_results=details_str
        )
        db.add(log)
        
        if a == "ALLOW":
            k.budget_used += cost
    
    db.commit()

# Check if we should run the seeder
import os

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
)

@app.on_event("startup")
def on_startup():
    if os.environ.get("CLAWGS_SEED_FAKE_DATA") == "true":
        from app.db.session import SessionLocal
        db = SessionLocal()
        # Only seed if no logs exist yet
        if db.query(audit_log.AuditLog).count() < 100:
            generate_fake_data(db)
        db.close()


# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(gateway.router, prefix=settings.API_V1_STR, tags=["Gateway"])
app.include_router(management.router, prefix="/api", tags=["Management"])
app.include_router(export.router, prefix="/api", tags=["Export"])
app.include_router(mcp.router, prefix=settings.API_V1_STR, tags=["MCP Proxy"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
