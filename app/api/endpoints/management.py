from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict
from app.core.guardrails import evaluate_policy
from typing import Optional, List, Any

class PolicyTestRequest(BaseModel):
    policy_id: int
    text: str

class RegexTestRequest(BaseModel):
    pattern: str
    text: str

class RegexTestResponse(BaseModel):
    matched: bool

class PolicyTestResponse(BaseModel):
    passed: bool
    details: dict


from app.api.deps import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.model_config import ModelConfig
from app.models.api_key import APIKey
from app.models.audit_log import AuditLog
from app.models.guardrail import GuardrailPolicy
from app.models.oidc_provider import OIDCProvider
from app.models.provider_key import ProviderKey
from app.models.management_audit_log import ManagementAuditLog

from app.models.export_config import ExportConfig
from app.models.block_template import BlockTemplate
class ExportConfigUpdate(BaseModel):
    token: str


router = APIRouter(dependencies=[Depends(get_current_user)])

def log_admin_action(db: Session, user: User, action: str, resource_type: str, resource_id: str, details: str = None):
    log = ManagementAuditLog(
        username=user.username,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        details=details
    )
    db.add(log)

class ManagementAuditLogResponse(BaseModel):
    id: int
    username: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    details: Optional[str]
    timestamp: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

@router.get("/system_audit_logs", response_model=dict)
def get_system_audit_logs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    total = db.query(ManagementAuditLog).count()
    items = db.query(ManagementAuditLog).order_by(ManagementAuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    
    # Handle older pydantic versions compatibility
    res_items = []
    for i in items:
        if hasattr(ManagementAuditLogResponse, "model_validate"):
            res_items.append(ManagementAuditLogResponse.model_validate(i))
        else:
            res_items.append(ManagementAuditLogResponse.from_orm(i))
    
    return {"total": total, "items": res_items}

# --- Users ---

class UserResponse(BaseModel):
    id: int
    username: str
    role: str

    model_config = ConfigDict(from_attributes=True)

class UserRoleUpdate(BaseModel):
    role: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str

class UserPasswordUpdate(BaseModel):
    password: str

@router.get("/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(User).all()

@router.post("/users", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    db_user = db.query(User).filter(User.username == user_in.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    if user_in.role not in ["admin", "AIOwner"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    from app.core.security import get_password_hash
    hashed_password = get_password_hash(user_in.password)
    
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_password,
        role=user_in.role
    )
    db.add(new_user)
    log_admin_action(db, current_user, "CREATE", "USER", user_in.username)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/users/{user_id}/password")
def update_user_password(user_id: int, password_in: UserPasswordUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    from app.core.security import get_password_hash
    user.hashed_password = get_password_hash(password_in.password)
    log_admin_action(db, current_user, "UPDATE", "USER_PASSWORD", user.username)
    db.commit()
    return {"message": "Password updated successfully"}

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    # Prevent deleting the last admin
    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin account")
            
    log_admin_action(db, current_user, "DELETE", "USER", user.username)
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@router.put("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(user_id: int, role_update: UserRoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if role_update.role not in ["admin", "AIOwner"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role_update.role
    
    log_admin_action(db, current_user, "UPDATE", "USER_ROLE", user.username, f"Role changed to {role_update.role}")
    
    db.commit()
    db.refresh(user)
    return user

# --- Model Configs ---


class ModelConfigCreate(BaseModel):
    name: str
    provider: str
    api_base: Optional[str] = None
    cost_center: Optional[str] = None
    is_default: bool = False
    block_template_id: Optional[int] = None

class ModelConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    api_base: Optional[str] = None
    cost_center: Optional[str] = None
    is_active: Optional[bool] = None
    block_template_id: Optional[int] = None

class ModelConfigResponse(BaseModel):
    id: int
    name: str
    provider: str
    api_base: Optional[str] = None
    cost_center: Optional[str] = None
    is_default: bool
    is_active: bool
    block_template_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

@router.get("/models", response_model=List[ModelConfigResponse])
def get_models(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    models = db.query(ModelConfig).all()
    return models

@router.post("/models", response_model=ModelConfigResponse)
def create_model(config: ModelConfigCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_model = db.query(ModelConfig).filter(ModelConfig.name == config.name).first()
    if db_model:
        raise HTTPException(status_code=400, detail="Model config already exists")
    
    # If this is set to default, unset other defaults
    if config.is_default:
        db.query(ModelConfig).update({ModelConfig.is_default: False})
        
    new_model = ModelConfig(
        name=config.name,
        provider=config.provider,
        api_base=config.api_base,
        cost_center=config.cost_center,
        is_default=config.is_default,
        block_template_id=config.block_template_id
    )
    db.add(new_model)
    log_admin_action(db, current_user, "CREATE", "MODEL", config.name)
    db.commit()
    db.refresh(new_model)
    return new_model

@router.put("/models/{model_id}", response_model=ModelConfigResponse)
def update_model(model_id: int, config: ModelConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
        
    if config.name is not None:
        db_model.name = config.name
    if config.provider is not None:
        db_model.provider = config.provider
    if config.api_base is not None:
        db_model.api_base = config.api_base
    if config.cost_center is not None:
        db_model.cost_center = config.cost_center
    if config.block_template_id is not None:
        db_model.block_template_id = config.block_template_id
    if config.is_active is not None:
        db_model.is_active = config.is_active
        
    log_admin_action(db, current_user, "UPDATE", "MODEL", db_model.name)
    db.commit()
    db.refresh(db_model)
    return db_model


@router.delete("/models/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
        
    log_admin_action(db, current_user, "DELETE", "MODEL", db_model.name)
    db.delete(db_model)
    db.commit()
    return {"message": "Model deleted"}

@router.post("/models/{model_id}/set_default")
def set_default_model(model_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
        
    db.query(ModelConfig).update({ModelConfig.is_default: False})
    db_model.is_default = True
    log_admin_action(db, current_user, "UPDATE", "MODEL", db_model.name, "Set as default")
    db.commit()
    return {"message": f"Model {db_model.name} set as default"}

# --- OIDC Providers ---

class OIDCProviderCreate(BaseModel):
    name: str
    client_id: str
    client_secret: str
    discovery_url: str
    is_active: bool = True

class OIDCProviderUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    discovery_url: Optional[str] = None
    is_active: Optional[bool] = None

class OIDCProviderResponse(BaseModel):
    id: int
    name: str
    client_id: str
    discovery_url: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

@router.get("/oidc_providers", response_model=List[OIDCProviderResponse])
def get_oidc_providers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(OIDCProvider).all()

@router.post("/oidc_providers", response_model=OIDCProviderResponse)
def create_oidc_provider(provider: OIDCProviderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_provider = db.query(OIDCProvider).filter(OIDCProvider.name == provider.name).first()
    if db_provider:
        raise HTTPException(status_code=400, detail="Provider name already exists")
    
    new_provider = OIDCProvider(
        name=provider.name,
        client_id=provider.client_id,
        client_secret=provider.client_secret,
        discovery_url=provider.discovery_url,
        is_active=provider.is_active
    )
    db.add(new_provider)
    db.commit()
    db.refresh(new_provider)
    return new_provider

@router.put("/oidc_providers/{provider_id}", response_model=OIDCProviderResponse)
def update_oidc_provider(provider_id: int, provider_update: OIDCProviderUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_provider = db.query(OIDCProvider).filter(OIDCProvider.id == provider_id).first()
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    if provider_update.name is not None:
        db_provider.name = provider_update.name
    if provider_update.client_id is not None:
        db_provider.client_id = provider_update.client_id
    if provider_update.client_secret is not None:
        db_provider.client_secret = provider_update.client_secret
    if provider_update.discovery_url is not None:
        db_provider.discovery_url = provider_update.discovery_url
    if provider_update.is_active is not None:
        db_provider.is_active = provider_update.is_active
        
    db.commit()
    db.refresh(db_provider)
    return db_provider

@router.delete("/oidc_providers/{provider_id}")
def delete_oidc_provider(provider_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_provider = db.query(OIDCProvider).filter(OIDCProvider.id == provider_id).first()
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    log_admin_action(db, current_user, "DELETE", "OIDC_PROVIDER", db_provider.name)
    db.delete(db_provider)
    db.commit()
    return {"message": "Provider deleted"}


class APIKeyCreate(BaseModel):
    key: str
    owner: str
    budget_limit: Optional[float] = None
    rate_limit_rpm: Optional[int] = None
    policy_ids: List[int] = []

class APIKeyUpdate(BaseModel):
    budget_limit: Optional[float] = None
    rate_limit_rpm: Optional[int] = None
    is_active: Optional[bool] = None
    policy_ids: Optional[List[int]] = None

class APIKeyPolicyResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)

class APIKeyResponse(BaseModel):
    id: int
    key: str
    owner: str
    budget_limit: Optional[float]
    budget_used: float
    rate_limit_rpm: Optional[int]
    is_active: bool
    policies: List[APIKeyPolicyResponse] = []

    model_config = ConfigDict(from_attributes=True)

@router.get("/api_keys", response_model=List[APIKeyResponse])
def get_api_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        keys = db.query(APIKey).all()
    else:
        keys = db.query(APIKey).filter(APIKey.owner == current_user.username).all()
    return keys

@router.post("/api_keys", response_model=APIKeyResponse)
def create_api_key(api_key: APIKeyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin" and api_key.owner != current_user.username:
        raise HTTPException(status_code=403, detail="Standard users can only create keys for themselves")
    db_key = db.query(APIKey).filter(APIKey.key == api_key.key).first()
    if db_key:
        raise HTTPException(status_code=400, detail="API Key already exists")
        
    new_key = APIKey(
        key=api_key.key,
        owner=api_key.owner,
        budget_limit=api_key.budget_limit,
        rate_limit_rpm=api_key.rate_limit_rpm
    )
    
    db.add(new_key)
    db.commit()
    
    if api_key.policy_ids:
        from app.models.api_key import api_key_guardrails
        for idx, p_id in enumerate(api_key.policy_ids):
            db.execute(api_key_guardrails.insert().values(
                api_key_id=new_key.id,
                guardrail_id=p_id,
                sort_order=idx
            ))
            
    log_admin_action(db, current_user, "CREATE", "API_KEY", new_key.owner)
    db.commit()
    db.refresh(new_key)
    return new_key

@router.put("/api_keys/{key_id}", response_model=APIKeyResponse)
def update_api_key(key_id: int, key_update: APIKeyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required to edit keys")
    db_key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not db_key:
        raise HTTPException(status_code=404, detail="API Key not found")
        
    if key_update.budget_limit is not None:
        db_key.budget_limit = key_update.budget_limit
    if key_update.rate_limit_rpm is not None:
        db_key.rate_limit_rpm = key_update.rate_limit_rpm
    if key_update.is_active is not None:
        db_key.is_active = key_update.is_active
    
    if key_update.policy_ids is not None:
        from app.models.api_key import api_key_guardrails
        
        # Clear existing associations
        db.execute(api_key_guardrails.delete().where(api_key_guardrails.c.api_key_id == key_id))
        
        # Insert with explicit order
        for idx, p_id in enumerate(key_update.policy_ids):
            db.execute(api_key_guardrails.insert().values(
                api_key_id=key_id,
                guardrail_id=p_id,
                sort_order=idx
            ))
        
    log_admin_action(db, current_user, "UPDATE", "API_KEY", db_key.owner)
    db.commit()
    db.refresh(db_key)
    return db_key

@router.delete("/api_keys/{key_id}")
def delete_api_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not db_key:
        raise HTTPException(status_code=404, detail="API Key not found")
    
    log_admin_action(db, current_user, "DELETE", "API_KEY", db_key.owner)
    db.delete(db_key)
    db.commit()
    return {"message": "API Key deleted"}

# --- Audit Logs ---

class AuditLogResponse(BaseModel):
    id: int
    api_key_id: Optional[int]
    owner: Optional[str] = None
    model_used: str
    cost_center: Optional[str] = None
    tokens_prompt: int
    tokens_completion: int
    cost: float
    action: str
    timestamp: Optional[Any] = None
    response_sent_at: Optional[Any] = None
    gateway_processing_time_ms: Optional[float] = 0.0
    llm_time_ms: Optional[float] = 0.0
    request_payload: Optional[str] = None
    response_payload: Optional[str] = None
    guardrail_results: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PaginatedAuditLogs(BaseModel):
    items: List[AuditLogResponse]
    total: int

@router.get("/audit_logs", response_model=PaginatedAuditLogs)
def get_audit_logs(
    skip: int = 0, 
    limit: int = 20, 
    type: Optional[str] = None,
    owner: Optional[str] = None,
    cost_center: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = db.query(AuditLog, APIKey.owner.label('owner_name')).outerjoin(APIKey, AuditLog.api_key_id == APIKey.id)
    
    if current_user.role != "admin":
        query = query.filter(APIKey.owner == current_user.username)
    elif owner:
        query = query.filter(APIKey.owner.ilike(f"%{owner}%"))
            
    if type == "mcp":
        query = query.filter(AuditLog.model_used.like("mcp_server_%"))
    elif type == "model":
        query = query.filter(AuditLog.model_used.notlike("mcp_server_%"))
        
    if cost_center:
        query = query.filter(AuditLog.cost_center.ilike(f"%{cost_center}%"))
        
    if date_from:
        try:
            from dateutil import parser
            dt_from = parser.parse(date_from)
            query = query.filter(AuditLog.timestamp >= dt_from)
        except: pass
        
    if date_to:
        try:
            from dateutil import parser
            import datetime
            dt_to = parser.parse(date_to)
            # If the user selected a date without time, it sets it to midnight.
            # To include the whole day, we can just replace hour, minute, second to 23:59:59
            dt_to = dt_to.replace(hour=23, minute=59, second=59)
            query = query.filter(AuditLog.timestamp <= dt_to)
        except: pass
        
    total = query.count()
    results = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    
    logs = []
    for log, owner_name in results:
        log_dict = {c.name: getattr(log, c.name) for c in log.__table__.columns}
        log_dict['owner'] = owner_name
        logs.append(log_dict)
        
    return {"items": logs, "total": total}


@router.get("/audit_logs/metadata")
def get_audit_logs_metadata(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        owners = [current_user.username]
        cost_centers_query = db.query(AuditLog.cost_center).join(APIKey).filter(APIKey.owner == current_user.username, AuditLog.cost_center != None).distinct().all()
    else:
        owners_query = db.query(APIKey.owner).distinct().all()
        owners = [o[0] for o in owners_query if o[0]]
        
        cost_centers_query = db.query(AuditLog.cost_center).filter(AuditLog.cost_center != None).distinct().all()
        
    cost_centers = [c[0] for c in cost_centers_query if c[0]]
    
    return {"owners": sorted(owners), "cost_centers": sorted(cost_centers)}

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import func
    
    query = db.query(AuditLog)
    if current_user.role != "admin":
        query = query.join(APIKey).filter(APIKey.owner == current_user.username)
        
    # Optimized single pass query for total stats
    stats_res = db.query(
        func.count(AuditLog.id), 
        func.sum(AuditLog.cost), 
        func.sum(AuditLog.tokens_prompt + AuditLog.tokens_completion)
    )
    if current_user.role != "admin":
        stats_res = stats_res.join(APIKey).filter(APIKey.owner == current_user.username)
    
    stats_row = stats_res.first()
    total_requests = stats_row[0] or 0
    total_cost = float(stats_row[1] or 0.0)
    total_tokens = int(stats_row[2] or 0)
    
    # Cost by model
    model_stats = db.query(
        AuditLog.model_used,
        func.count(AuditLog.id).label("requests"),
        func.sum(AuditLog.cost).label("cost")
    )
    if current_user.role != "admin":
        model_stats = model_stats.join(APIKey).filter(APIKey.owner == current_user.username)
    model_stats = model_stats.group_by(AuditLog.model_used).all()
    
    # Usage over time (last 30 days)
    from datetime import datetime, timedelta, timezone
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    time_stats = db.query(
        func.date(AuditLog.timestamp).label("date"),
        func.count(AuditLog.id).label("requests"),
        func.sum(AuditLog.cost).label("cost")
    ).filter(AuditLog.timestamp >= thirty_days_ago)
    if current_user.role != "admin":
        time_stats = time_stats.join(APIKey).filter(APIKey.owner == current_user.username)
    time_stats = time_stats.group_by(func.date(AuditLog.timestamp)).order_by(func.date(AuditLog.timestamp).asc()).all()

    from datetime import datetime, timezone
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    incidents_today = query.filter(AuditLog.action.like("BLOCK%"), AuditLog.timestamp >= today_start).count()
    threats_stopped = query.filter(AuditLog.action.like("BLOCK%")).count()

    # Key stats
    key_stats_q = db.query(APIKey.owner, func.count(AuditLog.id), func.sum(AuditLog.cost)).join(AuditLog, AuditLog.api_key_id == APIKey.id)
    if current_user.role != "admin":
        key_stats_q = key_stats_q.filter(APIKey.owner == current_user.username)
    key_stats = key_stats_q.group_by(APIKey.owner).order_by(func.count(AuditLog.id).desc()).limit(10).all()

    # Action stats
    action_stats_q = db.query(AuditLog.action, func.count(AuditLog.id))
    if current_user.role != "admin":
        action_stats_q = action_stats_q.join(APIKey).filter(APIKey.owner == current_user.username)
    action_stats = action_stats_q.group_by(AuditLog.action).all()

    # Top policies
    policy_counts = {}
    import json
    blocked_logs = query.filter(AuditLog.action.like("BLOCK%")).all()
    for log in blocked_logs:
        if log.guardrail_results:
            try:
                results = json.loads(log.guardrail_results)
                for r in results:
                    if r.get("status") == "fail":
                        name = r.get("name", "Unknown")
                        policy_counts[name] = policy_counts.get(name, 0) + 1
            except:
                pass
    top_policies = [{"name": k, "count": v} for k, v in sorted(policy_counts.items(), key=lambda item: item[1], reverse=True)[:5]]

    # Sort model stats explicitly before returning to ensure frontend gets the top ones
    sorted_models = sorted([{"model": m[0] or "unknown", "requests": m[1], "cost": float(m[2] or 0)} for m in model_stats], key=lambda x: x["requests"], reverse=True)

    return {
        "by_key": [{"owner": k[0], "requests": k[1], "cost": float(k[2] or 0)} for k in key_stats],
        "by_action": [{"action": a[0], "count": a[1]} for a in action_stats],
        "top_policies": top_policies,
        "summary": {
            "total_cost": total_cost,
            "total_requests": total_requests,
            "total_tokens": total_tokens
        },
        "incidents_today": incidents_today,
        "threats_stopped": threats_stopped,
        "by_model": sorted_models,
        "over_time": [{"date": t[0], "requests": t[1], "cost": float(t[2] or 0)} for t in time_stats]
    }


# --- Guardrail Policies ---

class GuardrailPolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target: str
    type: str
    config: dict
    action: str = "block"
    is_active: bool = True
    is_global: bool = False

class GuardrailPolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None
    action: Optional[str] = None
    is_active: Optional[bool] = None
    is_global: Optional[bool] = None

class GuardrailPolicyResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    target: str
    type: str
    config: dict
    action: str
    is_active: bool
    is_global: bool

    model_config = ConfigDict(from_attributes=True)

# --- Block Templates ---

class BlockTemplateCreate(BaseModel):
    name: str
    content: str
    is_default: bool = False

class BlockTemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None

class BlockTemplateResponse(BaseModel):
    id: int
    name: str
    content: str
    is_default: bool
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

# --- Webhooks ---

class WebhookConfigCreate(BaseModel):
    url: str
    description: Optional[str] = None
    secret_token: Optional[str] = None
    is_active: bool = True

class WebhookConfigUpdate(BaseModel):
    url: Optional[str] = None
    description: Optional[str] = None
    secret_token: Optional[str] = None
    is_active: Optional[bool] = None

class WebhookConfigResponse(BaseModel):
    id: int
    url: str
    description: Optional[str]
    is_active: bool
    # Exclude secret_token for security

    model_config = ConfigDict(from_attributes=True)

from app.models.webhook_config import WebhookConfig

@router.get("/webhooks", response_model=List[WebhookConfigResponse])
def get_webhooks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(WebhookConfig).all()

@router.post("/webhooks", response_model=WebhookConfigResponse)
def create_webhook(wh: WebhookConfigCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    new_wh = WebhookConfig(
        url=wh.url,
        description=wh.description,
        secret_token=wh.secret_token,
        is_active=wh.is_active
    )
    db.add(new_wh)
    log_admin_action(db, current_user, "CREATE", "WEBHOOK", wh.url)
    db.commit()
    db.refresh(new_wh)
    return new_wh

@router.put("/webhooks/{wh_id}", response_model=WebhookConfigResponse)
def update_webhook(wh_id: int, wh_update: WebhookConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_wh = db.query(WebhookConfig).filter(WebhookConfig.id == wh_id).first()
    if not db_wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
        
    if wh_update.url is not None:
        db_wh.url = wh_update.url
    if wh_update.description is not None:
        db_wh.description = wh_update.description
    if wh_update.secret_token is not None:
        db_wh.secret_token = wh_update.secret_token
    if wh_update.is_active is not None:
        db_wh.is_active = wh_update.is_active
        
    log_admin_action(db, current_user, "UPDATE", "WEBHOOK", db_wh.url)
    db.commit()
    db.refresh(db_wh)
    return db_wh

@router.delete("/webhooks/{wh_id}")
def delete_webhook(wh_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_wh = db.query(WebhookConfig).filter(WebhookConfig.id == wh_id).first()
    if not db_wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    log_admin_action(db, current_user, "DELETE", "WEBHOOK", db_wh.url)
    db.delete(db_wh)
    db.commit()
    return {"message": "Webhook deleted"}

@router.get("/block_templates", response_model=List[BlockTemplateResponse])
def get_block_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(BlockTemplate).all()

@router.post("/block_templates", response_model=BlockTemplateResponse)
def create_block_template(template: BlockTemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if template.is_default:
        db.query(BlockTemplate).update({BlockTemplate.is_default: False})
        
    new_template = BlockTemplate(
        name=template.name,
        content=template.content,
        is_default=template.is_default
    )
    db.add(new_template)
    log_admin_action(db, current_user, "CREATE", "BLOCK_TEMPLATE", new_template.name)
    db.commit()
    db.refresh(new_template)
    return new_template

@router.put("/block_templates/{template_id}", response_model=BlockTemplateResponse)
def update_block_template(template_id: int, template_update: BlockTemplateUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_template = db.query(BlockTemplate).filter(BlockTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if template_update.name is not None:
        db_template.name = template_update.name
    if template_update.content is not None:
        db_template.content = template_update.content
    if template_update.is_active is not None:
        db_template.is_active = template_update.is_active
        
    log_admin_action(db, current_user, "UPDATE", "BLOCK_TEMPLATE", db_template.name)
    db.commit()
    db.refresh(db_template)
    return db_template

@router.post("/block_templates/{template_id}/set_default")
def set_default_block_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_template = db.query(BlockTemplate).filter(BlockTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    db.query(BlockTemplate).update({BlockTemplate.is_default: False})
    db_template.is_default = True
    log_admin_action(db, current_user, "UPDATE", "BLOCK_TEMPLATE", db_template.name, "Set as default")
    db.commit()
    return {"message": f"Template {db_template.name} set as default"}

@router.delete("/block_templates/{template_id}")
def delete_block_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_template = db.query(BlockTemplate).filter(BlockTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    log_admin_action(db, current_user, "DELETE", "BLOCK_TEMPLATE", db_template.name)
    db.delete(db_template)
    db.commit()
    return {"message": "Template deleted"}

@router.get("/guardrails", response_model=List[GuardrailPolicyResponse])
def get_guardrails(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(GuardrailPolicy).all()

@router.post("/guardrails", response_model=GuardrailPolicyResponse)
def create_guardrail(policy: GuardrailPolicyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_policy = db.query(GuardrailPolicy).filter(GuardrailPolicy.name == policy.name).first()
    if db_policy:
        raise HTTPException(status_code=400, detail="Policy name already exists")
    
    new_policy = GuardrailPolicy(
        name=policy.name,
        description=policy.description,
        target=policy.target,
        type=policy.type,
        config=policy.config,
        action=policy.action,
        is_active=policy.is_active,
        is_global=policy.is_global
    )
    db.add(new_policy)
    log_admin_action(db, current_user, "CREATE", "GUARDRAIL", new_policy.name)
    db.commit()
    db.refresh(new_policy)
    return new_policy

@router.put("/guardrails/{policy_id}", response_model=GuardrailPolicyResponse)
def update_guardrail(policy_id: int, policy_update: GuardrailPolicyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_policy = db.query(GuardrailPolicy).filter(GuardrailPolicy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    if policy_update.name is not None:
        db_policy.name = policy_update.name
    if policy_update.description is not None:
        db_policy.description = policy_update.description
    if policy_update.target is not None:
        db_policy.target = policy_update.target
    if policy_update.type is not None:
        db_policy.type = policy_update.type
    if policy_update.config is not None:
        db_policy.config = policy_update.config
    if policy_update.action is not None:
        db_policy.action = policy_update.action
    if policy_update.is_active is not None:
        db_policy.is_active = policy_update.is_active
    if policy_update.is_global is not None:
        db_policy.is_global = policy_update.is_global
        
    log_admin_action(db, current_user, "UPDATE", "GUARDRAIL", db_policy.name)
    db.commit()
    db.refresh(db_policy)
    return db_policy

@router.delete("/guardrails/{policy_id}")
def delete_guardrail(policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_policy = db.query(GuardrailPolicy).filter(GuardrailPolicy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    log_admin_action(db, current_user, "DELETE", "GUARDRAIL", db_policy.name)
    db.delete(db_policy)
    db.commit()
    return {"message": "Policy deleted"}


# --- Provider Keys ---

class ProviderKeyCreate(BaseModel):
    provider_name: str
    api_key: str

@router.get("/provider_keys")
def get_provider_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    keys = db.query(ProviderKey).all()
    return [{"id": k.id, "provider_name": k.provider_name, "has_key": True} for k in keys]

@router.post("/provider_keys")
def create_or_update_provider_key(key_in: ProviderKeyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_key = db.query(ProviderKey).filter(ProviderKey.provider_name == key_in.provider_name).first()
    if db_key:
        db_key.api_key = key_in.api_key
        action_name = "UPDATE"
    else:
        db_key = ProviderKey(provider_name=key_in.provider_name, api_key=key_in.api_key)
        db.add(db_key)
        action_name = "CREATE"
        
    log_admin_action(db, current_user, action_name, "PROVIDER_KEY", db_key.provider_name)
    db.commit()
    db.refresh(db_key)
    return {"id": db_key.id, "provider_name": db_key.provider_name, "has_key": True}

@router.delete("/provider_keys/{key_id}")
def delete_provider_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_key = db.query(ProviderKey).filter(ProviderKey.id == key_id).first()
    if not db_key:
        raise HTTPException(status_code=404, detail="Provider key not found")
        
    log_admin_action(db, current_user, "DELETE", "PROVIDER_KEY", db_key.provider_name)
    db.delete(db_key)
    db.commit()
    return {"message": "Deleted"}


# --- MCP Servers ---
from app.models.mcp_server import MCPServer

class MCPServerCreate(BaseModel):
    name: str
    url: str
    auth_token: Optional[str] = None
    whitelisted_tools: Optional[List[str]] = []
    is_active: bool = True
    block_template_id: Optional[int] = None

class MCPServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    auth_token: Optional[str] = None
    whitelisted_tools: Optional[List[str]] = None
    is_active: Optional[bool] = None
    block_template_id: Optional[int] = None

class MCPServerResponse(BaseModel):
    id: int
    name: str
    url: str
    auth_token: Optional[str] = None
    whitelisted_tools: Optional[List[str]] = []
    is_active: bool
    block_template_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

@router.get("/mcp_servers", response_model=List[MCPServerResponse])
def get_mcp_servers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(MCPServer).all()

@router.post("/mcp_servers", response_model=MCPServerResponse)
def create_mcp_server(srv: MCPServerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_srv = db.query(MCPServer).filter(MCPServer.name == srv.name).first()
    if db_srv:
        raise HTTPException(status_code=400, detail="MCP Server with this name already exists")
    
    new_srv = MCPServer(
        name=srv.name,
        url=srv.url,
        auth_token=srv.auth_token,
        whitelisted_tools=srv.whitelisted_tools or [],
        is_active=srv.is_active,
        block_template_id=srv.block_template_id
    )
    db.add(new_srv)
    log_admin_action(db, current_user, "CREATE", "MCP_SERVER", srv.name)
    db.commit()
    db.refresh(new_srv)
    return new_srv

@router.put("/mcp_servers/{srv_id}", response_model=MCPServerResponse)
def update_mcp_server(srv_id: int, srv_update: MCPServerUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_srv = db.query(MCPServer).filter(MCPServer.id == srv_id).first()
    if not db_srv:
        raise HTTPException(status_code=404, detail="MCP Server not found")
        
    if srv_update.name is not None:
        db_srv.name = srv_update.name
    if srv_update.url is not None:
        db_srv.url = srv_update.url
    if srv_update.auth_token is not None:
        db_srv.auth_token = srv_update.auth_token
    if srv_update.whitelisted_tools is not None:
        db_srv.whitelisted_tools = srv_update.whitelisted_tools
    if srv_update.block_template_id is not None:
        db_srv.block_template_id = srv_update.block_template_id
    if srv_update.is_active is not None:
        db_srv.is_active = srv_update.is_active
        
    log_admin_action(db, current_user, "UPDATE", "MCP_SERVER", db_srv.name)
    db.commit()
    db.refresh(db_srv)
    return db_srv

@router.delete("/mcp_servers/{srv_id}")
def delete_mcp_server(srv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_srv = db.query(MCPServer).filter(MCPServer.id == srv_id).first()
    if not db_srv:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    
    log_admin_action(db, current_user, "DELETE", "MCP_SERVER", db_srv.name)
    db.delete(db_srv)
    db.commit()
    return {"message": "MCP Server deleted"}


import httpx

@router.post("/mcp_servers/{srv_id}/fetch_tools")
async def fetch_mcp_tools(srv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db_srv = db.query(MCPServer).filter(MCPServer.id == srv_id).first()
    if not db_srv:
        raise HTTPException(status_code=404, detail="MCP Server not found")
        
    # Build standard JSON-RPC payload for tools/list
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "id": 1
    }
    
    headers = {"Content-Type": "application/json"}
    if db_srv.auth_token:
        headers["Authorization"] = f"Bearer {db_srv.auth_token}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(db_srv.url, json=payload, headers=headers, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            if "result" in data and "tools" in data["result"]:
                return {"tools": data["result"]["tools"]}
            else:
                return {"tools": [], "error": "Invalid response format from MCP server"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch tools: {str(e)}")


@router.get("/export_config")
def get_export_config(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    cfg = db.query(ExportConfig).first()
    return {"token": cfg.token if cfg else ""}

@router.post("/export_config")
def set_export_config(data: ExportConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    cfg = db.query(ExportConfig).first()
    if not cfg:
        cfg = ExportConfig(token=data.token)
        db.add(cfg)
    else:
        cfg.token = data.token
    db.commit()
    return {"message": "Export configuration saved"}

@router.post("/tools/test_policy", response_model=PolicyTestResponse)
async def test_policy(req: PolicyTestRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    policy = db.query(GuardrailPolicy).filter(GuardrailPolicy.id == req.policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    passed, details = await evaluate_policy(policy, req.text)
    return {"passed": passed, "details": details}

@router.post("/tools/test_regex", response_model=RegexTestResponse)
def test_regex(req: RegexTestRequest, current_user: User = Depends(get_current_user)):
    import re
    try:
        matched = bool(re.search(req.pattern, req.text, re.IGNORECASE))
        return {"matched": matched}
    except re.error as e:
        raise HTTPException(status_code=400, detail=f"Invalid regex: {str(e)}")
