from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import csv
import io
import json

from app.api.deps import get_db
from app.models.export_config import ExportConfig
from app.models.audit_log import AuditLog
from app.models.api_key import APIKey

router = APIRouter()

@router.get("/export/audit_logs")
def export_audit_logs(
    format: str = "csv",
    type: str = None,
    owner: str = None,
    cost_center: str = None,
    date_from: str = None,
    date_to: str = None,
    authorization: str = Header(None),
    request: Request = None,
    db: Session = Depends(get_db)
):
    if not authorization or not authorization.startswith("Bearer "):
        # Check if auth passed in query params as a fallback for simple browser downloads
        token_query = request.query_params.get("token")
        if token_query:
            token = token_query
        else:
            raise HTTPException(status_code=401, detail="Missing or invalid token")
    else:
        token = authorization.split("Bearer ")[1]
    
    config = db.query(ExportConfig).first()
    if not config or config.token != token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    query = db.query(AuditLog, APIKey.owner).outerjoin(APIKey, AuditLog.api_key_id == APIKey.id)
    
    if type == "mcp":
        query = query.filter(AuditLog.model_used.like("mcp_server_%"))
    elif type == "model":
        query = query.filter(AuditLog.model_used.notlike("mcp_server_%"))
        
    if owner:
        query = query.filter(APIKey.owner.ilike(f"%{owner}%"))
        
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
            dt_to = dt_to.replace(hour=23, minute=59, second=59)
            query = query.filter(AuditLog.timestamp <= dt_to)
        except: pass
        
    results = query.order_by(AuditLog.timestamp.desc()).all()

    if format == "json":
        def iter_json():
            yield "[\n"
            for i, (log, log_owner) in enumerate(results):
                log_dict = {
                    "id": log.id,
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "api_key_id": log.api_key_id,
                    "owner": log_owner,
                    "model_used": log.model_used,
                    "cost_center": log.cost_center,
                    "tokens_prompt": log.tokens_prompt,
                    "tokens_completion": log.tokens_completion,
                    "cost": log.cost,
                    "action": log.action,
                    "gateway_processing_time_ms": log.gateway_processing_time_ms,
                    "llm_time_ms": log.llm_time_ms
                }
                yield json.dumps(log_dict) + (",\n" if i < len(results) - 1 else "\n")
            yield "]"
            
        return StreamingResponse(
            iter_json(), 
            media_type="application/json", 
            headers={"Content-Disposition": "attachment; filename=audit_logs_export.json"}
        )

    elif format == "csv":
        def iter_csv():
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "id", "timestamp", "api_key_id", "owner", "model_used", "cost_center", 
                "tokens_prompt", "tokens_completion", "cost", "action", 
                "gateway_processing_time_ms", "llm_time_ms"
            ])
            yield output.getvalue()
            output.seek(0); output.truncate(0)
            
            for log, log_owner in results:
                writer.writerow([
                    log.id, 
                    log.timestamp.isoformat() if log.timestamp else "", 
                    log.api_key_id or "", 
                    log_owner or "", 
                    log.model_used or "", 
                    log.cost_center or "", 
                    log.tokens_prompt or 0, 
                    log.tokens_completion or 0, 
                    log.cost or 0.0, 
                    log.action or "", 
                    log.gateway_processing_time_ms or 0.0, 
                    log.llm_time_ms or 0.0
                ])
                yield output.getvalue()
                output.seek(0); output.truncate(0)

        return StreamingResponse(
            iter_csv(), 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=audit_logs_export.csv"}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: csv, json")
