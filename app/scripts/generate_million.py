import os
import sys
import random
import time
from datetime import datetime, timedelta, timezone
import json

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.db.session import SessionLocal
from app.models.guardrail import GuardrailPolicy
from app.models.api_key import APIKey
from app.models.audit_log import AuditLog
from app.models.model_config import ModelConfig
from app.models.provider_key import ProviderKey
from sqlalchemy import insert

db = SessionLocal()

print("Gathering existing database metadata...")

# Fetch all keys
keys = db.query(APIKey.id, APIKey.owner, APIKey.budget_used).all()
if not keys:
    print("No API Keys found. Generating some dummy keys...")
    owners = ["alice_dev", "bob_research", "charlie_prod", "diana_analytics", "mcp_agent"]
    for o in owners:
        key_obj = APIKey(key=f"clw_fake_mill_{o}", owner=o, budget_limit=100000.0, is_active=True)
        db.add(key_obj)
    db.commit()
    keys = db.query(APIKey.id, APIKey.owner, APIKey.budget_used).all()

# Fetch models
models = db.query(ModelConfig.name, ModelConfig.cost_center).all()
if not models:
    print("No Models found. Generating some dummy models...")
    for m in ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro", "mistral-large"]:
        mc = ModelConfig(name=m, provider="mock", is_active=True, cost_center="Default")
        db.add(mc)
    db.commit()
    models = db.query(ModelConfig.name, ModelConfig.cost_center).all()

model_list = [m[0] for m in models]
model_ccs = {m[0]: m[1] or "Default" for m in models}
key_ids = [k[0] for k in keys]

# Pre-compute payloads to avoid JSON parsing/dumping 1,000,000 times
req_payload_str = json.dumps({"messages": [{"role": "user", "content": "Analyze this data."}]})
res_payload_str = json.dumps({"choices": [{"message": {"content": "Data analysis complete. Everything looks normal."}}]})
failed_details = json.dumps([{"name": "General Security Policy", "target": "pre-flight", "status": "fail"}])

start_date = datetime(2025, 1, 1, tzinfo=timezone.utc)
end_date = datetime(2026, 10, 3, tzinfo=timezone.utc)
delta_seconds = int((end_date - start_date).total_seconds())

TOTAL_RECORDS = 1_000_000
BATCH_SIZE = 25_000

print(f"Starting generation of {TOTAL_RECORDS} audit logs...")
print("This may take a minute. Connecting directly to SQLite via fast bulk inserts...")

records = []
budget_additions = {k_id: 0.0 for k_id in key_ids}

start_proc_time = time.time()

for i in range(1, TOTAL_RECORDS + 1):
    # Determine random time
    random_second = random.randint(0, delta_seconds)
    fake_time = start_date + timedelta(seconds=random_second)
    
    k_id = random.choice(key_ids)
    
    # 5% chance it's an MCP server call
    if random.random() < 0.05:
        m_name = f"mcp_server_{random.randint(1, 3)}"
        c_center = "Agent Tools"
    else:
        m_name = random.choice(model_list)
        c_center = model_ccs.get(m_name, "Default")
    
    # Determine action probabilities
    # Let's say 88% allow, 10% block policy, 2% rate limit
    r_action = random.random()
    if r_action < 0.88:
        action = "ALLOW"
    elif r_action < 0.98:
        action = "BLOCK_POLICY"
    else:
        action = "BLOCK_RATE_LIMIT"
        
    prompt_tokens = random.randint(10, 1500)
    completion_tokens = random.randint(0, 800) if action == "ALLOW" else 0
    cost = (prompt_tokens + completion_tokens) * 0.00001
    
    gw_time = random.uniform(5.0, 35.0)
    llm_time = random.uniform(100.0, 2000.0) if action == "ALLOW" else 0.0
    
    records.append({
        "api_key_id": k_id,
        "model_used": m_name,
        "cost_center": c_center,
        "tokens_prompt": prompt_tokens,
        "tokens_completion": completion_tokens,
        "cost": cost,
        "action": action,
        "timestamp": fake_time,
        "response_sent_at": fake_time + timedelta(milliseconds=gw_time+llm_time),
        "gateway_processing_time_ms": gw_time,
        "llm_time_ms": llm_time,
        "request_payload": req_payload_str,
        "response_payload": res_payload_str if action == "ALLOW" else None,
        "guardrail_results": failed_details if action != "ALLOW" else None
    })
    
    if action == "ALLOW":
        budget_additions[k_id] += cost

    # Insert in batches to prevent memory overflow
    if i % BATCH_SIZE == 0:
        db.execute(insert(AuditLog), records)
        db.commit()
        records = []
        sys.stdout.write(f"\rGenerated {i:,} / {TOTAL_RECORDS:,} logs...")
        sys.stdout.flush()

# Insert any remaining
if records:
    db.execute(insert(AuditLog), records)
    db.commit()

# Update budgets
print("\nUpdating API Key budgets...")
for k_id, total_cost in budget_additions.items():
    key = db.query(APIKey).filter(APIKey.id == k_id).first()
    if key:
        if key.budget_used is None:
            key.budget_used = 0
        key.budget_used += total_cost
db.commit()

elapsed = time.time() - start_proc_time
print(f"Successfully generated 1,000,000 fake audit logs in {elapsed:.2f} seconds!")
