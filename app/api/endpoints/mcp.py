from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import httpx
import json

from app.api.deps import get_db
from fastapi import Header
from app.models.mcp_server import MCPServer
from app.models.api_key import APIKey
from app.models.audit_log import AuditLog
from app.core.guardrails import run_mcp_pre_flight_checks, GuardrailException

from app.models.block_template import BlockTemplate

router = APIRouter()

@router.post("/mcp/{server_id}")
async def mcp_proxy(server_id: int, request: Request, authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    key_str = authorization.split("Bearer ")[1]
    api_key = db.query(APIKey).filter(APIKey.key == key_str, APIKey.is_active == True).first()
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    # 1. Verify Server
    server = db.query(MCPServer).filter(MCPServer.id == server_id, MCPServer.is_active == True).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP Server not found or inactive")
    
    # 2. Parse Request
    try:
        mcp_payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # 3. Whitelist check & Guardrails
    method = mcp_payload.get("method")
    if method == "tools/call":
        tool_name = mcp_payload.get("params", {}).get("name")
        whitelisted = server.whitelisted_tools or []
        if whitelisted and tool_name not in whitelisted:
            error_msg = {
                "jsonrpc": "2.0",
                "error": {"code": -32000, "message": f"Tool '{tool_name}' is not whitelisted on this server."},
                "id": mcp_payload.get("id")
            }
            audit = AuditLog(
                api_key_id=api_key.id,
                model_used=f"mcp_server_{server_id}",
                request_payload=json.dumps(mcp_payload),
                response_payload=json.dumps(error_msg),
                guardrail_results=json.dumps([]),
                action="BLOCK_WHITELIST"
            )
            db.add(audit)
            db.commit()
            return error_msg

    guardrail_results = []
    try:
        guardrail_results = await run_mcp_pre_flight_checks(mcp_payload, db, api_key)
    except GuardrailException as e:
        template = None
        if server.block_template_id:
            template = db.query(BlockTemplate).filter(BlockTemplate.id == server.block_template_id, BlockTemplate.is_active == True).first()
        if not template:
            template = db.query(BlockTemplate).filter(BlockTemplate.is_default == True, BlockTemplate.is_active == True).first()
        
        block_msg = template.content if template else f"Blocked by clawGS policy: {e.detail}"

        # Standard JSON-RPC error
        error_msg = {
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": block_msg},
            "id": mcp_payload.get("id")
        }
        # Log audit
        audit = AuditLog(
            api_key_id=api_key.id,
            model_used=f"mcp_server_{server_id}",
            request_payload=json.dumps(mcp_payload),
            response_payload=json.dumps(error_msg),
            guardrail_results=json.dumps(e.results),
            action="BLOCK_POLICY"
        )
        db.add(audit)
        db.commit()
        return error_msg

    # 4. Proxy to Server
    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    async with httpx.AsyncClient() as client:
        try:
            # We assume the MCP Server takes POST JSON-RPC. If it's WS, it requires different handling.
            # The prompt implies simple JSON-RPC proxy endpoint.
            response = await client.post(server.url, json=mcp_payload, headers=headers, timeout=30.0)
            response.raise_for_status()
            upstream_resp = response.json()
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"Bad Gateway: Error communicating with MCP server: {str(ex)}")

    # 5. Audit Logging
    audit = AuditLog(
        api_key_id=api_key.id,
        model_used=f"mcp_server_{server_id}",
        request_payload=json.dumps(mcp_payload),
        response_payload=json.dumps(upstream_resp),
        guardrail_results=json.dumps(guardrail_results),
        action="ALLOW"
    )
    db.add(audit)
    db.commit()

    return upstream_resp
