import time
from datetime import datetime, timezone
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import redis
import httpx

from app.core.config import settings
from app.api.deps import get_db
from app.db.session import SessionLocal
from app.models.api_key import APIKey
from app.models.model_config import ModelConfig
from app.models.audit_log import AuditLog
from app.models.provider_key import ProviderKey
from app.models.block_template import BlockTemplate
from app.models.webhook_config import WebhookConfig
from app.services.llm_router import route_completion
from app.core.guardrails import run_pre_flight_checks, run_post_flight_checks, GuardrailException

router = APIRouter()

# Simple in-memory rate limiting dictionary: {api_key_id: [timestamp1, timestamp2, ...]}
RATE_LIMIT_STORE = defaultdict(list)
redis_client = redis.Redis.from_url(settings.REDIS_URL) if settings.REDIS_URL else None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    # Other standard OpenAI kwargs can be added here
    temperature: Optional[float] = 1.0

async def _send_webhooks_bg(webhooks_data, payload):
    async with httpx.AsyncClient() as client:
        for url, token in webhooks_data:
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            try:
                await client.post(url, json=payload, headers=headers, timeout=3.0)
            except Exception:
                pass

def _generate_mock_block_response(db: Session, model_name: str, is_stream: bool = False, is_google_path: bool = False, is_anthropic_path: bool = False) -> Any:
    template = None
    if model_name:
        model = db.query(ModelConfig).filter(ModelConfig.name == model_name, ModelConfig.is_active == True).first()
        if model and model.block_template_id:
            template = db.query(BlockTemplate).filter(BlockTemplate.id == model.block_template_id, BlockTemplate.is_active == True).first()
    
    if not template:
        template = db.query(BlockTemplate).filter(BlockTemplate.is_default == True, BlockTemplate.is_active == True).first()
        
    content = template.content if template else "I am sorry, but this request has been blocked by the organization's security policy."
    
    if is_stream:
        async def mock_generator():
            import json
            if is_google_path:
                google_chunk = {
                    "candidates": [
                        {
                            "content": {"parts": [{"text": content}], "role": "model"},
                            "finishReason": "STOP"
                        }
                    ]
                }
                yield f"data: {json.dumps(google_chunk)}\n\n"
            elif is_anthropic_path:
                anthropic_chunk1 = {"type": "message_start", "message": {"id": "msg_mock", "type": "message", "role": "assistant", "content": [], "model": model_name or "unknown", "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0}}}
                anthropic_chunk2 = {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
                anthropic_chunk3 = {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": content}}
                anthropic_chunk4 = {"type": "content_block_stop", "index": 0}
                anthropic_chunk5 = {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 0}}
                anthropic_chunk6 = {"type": "message_stop"}
                
                yield f"event: message_start\ndata: {json.dumps(anthropic_chunk1)}\n\n"
                yield f"event: content_block_start\ndata: {json.dumps(anthropic_chunk2)}\n\n"
                yield f"event: content_block_delta\ndata: {json.dumps(anthropic_chunk3)}\n\n"
                yield f"event: content_block_stop\ndata: {json.dumps(anthropic_chunk4)}\n\n"
                yield f"event: message_delta\ndata: {json.dumps(anthropic_chunk5)}\n\n"
                yield f"event: message_stop\ndata: {json.dumps(anthropic_chunk6)}\n\n"
            else:
                openai_chunk = {
                    "id": "chatcmpl-blocked",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name or "unknown",
                    "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": "stop"}]
                }
                yield f"data: {json.dumps(openai_chunk)}\n\n"
                yield "data: [DONE]\n\n"
        return StreamingResponse(mock_generator(), media_type="text/event-stream")

    if is_google_path:
        return {
            "candidates": [
                {
                    "content": {"parts": [{"text": content}], "role": "model"},
                    "finishReason": "STOP"
                }
            ]
        }
    if is_anthropic_path:
        return {
            "id": "msg_mock",
            "type": "message",
            "role": "assistant",
            "model": model_name or "unknown",
            "content": [
                {"type": "text", "text": content}
            ],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0}
        }
        
    return {
        "id": "chatcmpl-blocked",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_name or "unknown",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": content
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }
    }

@router.get("/models")
async def list_models(db: Session = Depends(get_db)):
    models = db.query(ModelConfig).filter(ModelConfig.is_active == True).all()
    return {
        "object": "list",
        "data": [
            {
                "id": m.name,
                "object": "model",
                "created": 1677610602,
                "owned_by": "organization"
            } for m in models
        ]
    }

@router.get("/models/{model_name}")
async def get_model(model_name: str, db: Session = Depends(get_db)):
    m = db.query(ModelConfig).filter(ModelConfig.name == model_name, ModelConfig.is_active == True).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not Found")
    return {
        "id": m.name,
        "object": "model",
        "created": 1677610602,
        "owned_by": "organization"
    }

@router.post("/chat/completions")
@router.post("/v1beta/models/{model_name}:generateContent")
@router.post("/v1beta/models/{model_name}:streamGenerateContent")
@router.post("/messages")
async def create_chat_completion(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
    model_name: str = None
):
    # Support Google's x-goog-api-key and Anthropic's x-api-key header fallbacks
    is_google_path = "v1beta/models" in str(request.url)
    is_anthropic_path = "/messages" in str(request.url)
    
    google_api_key = request.headers.get("x-goog-api-key")
    anthropic_api_key = request.headers.get("x-api-key")
    
    if authorization and authorization.startswith("Bearer "):
        key_str = authorization.split("Bearer ")[1]
    elif google_api_key:
        key_str = google_api_key
    elif anthropic_api_key:
        key_str = anthropic_api_key
    else:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
        
    request_start_time = time.time()
    request_received_at = datetime.now(timezone.utc)
    llm_time_ms = 0.0
    
    # Validate API key
    api_key = db.query(APIKey).filter(APIKey.key == key_str, APIKey.is_active == True).first()
    if not api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Parse body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    import json
    request_payload_json = json.dumps(body)
    guardrail_results_all = []
    
    # Extract model (Google path param vs OpenAI body param)
    req_model_name = model_name if model_name else body.get("model")
    
    model_provider = None
    api_base = None
    cost_center = None
    
    if not req_model_name:
        default_model = db.query(ModelConfig).filter(ModelConfig.is_default == True, ModelConfig.is_active == True).first()
        if not default_model:
            raise HTTPException(status_code=500, detail="No default model configured")
        model_name = default_model.name
        model_provider = default_model.provider
        api_base = default_model.api_base
        cost_center = default_model.cost_center
    else:
        # Check if we have this model configured to get the provider
        db_model = db.query(ModelConfig).filter(ModelConfig.name == req_model_name).first()
        if not db_model:
            raise HTTPException(status_code=403, detail=f"Model '{req_model_name}' is not configured or allowed.")
        if not db_model.is_active:
            raise HTTPException(status_code=403, detail=f"Model '{req_model_name}' is currently disabled.")
        
        model_name = req_model_name
        model_provider = db_model.provider
        api_base = db_model.api_base
        cost_center = db_model.cost_center

    # Helper to generate standard mock response and audit log
    def handle_block(action: str, results_json: str = None):
        total_time_ms = (time.time() - request_start_time) * 1000
        log = AuditLog(
            api_key_id=api_key.id,
            model_used=model_name or "unknown",
            cost_center=cost_center,
            action=action,
            timestamp=request_received_at,
            response_sent_at=datetime.now(timezone.utc),
            gateway_processing_time_ms=total_time_ms,
            llm_time_ms=llm_time_ms,
            request_payload=request_payload_json,
            guardrail_results=results_json
        )
        db.add(log)
        db.commit()
        
        # Trigger Webhooks
        import json
        webhooks = db.query(WebhookConfig).filter(WebhookConfig.is_active == True).all()
        if webhooks:
            wh_data = [(wh.url, wh.secret_token) for wh in webhooks]
            payload = {
                "event_type": "SECURITY_BLOCK",
                "action": action,
                "model_used": model_name or "unknown",
                "cost_center": cost_center,
                "timestamp": request_received_at.isoformat(),
                "api_key_id": api_key.id,
                "owner": api_key.owner,
                "request_payload": json.loads(request_payload_json) if request_payload_json else None,
                "guardrail_results": json.loads(results_json) if results_json else None,
                "gateway_processing_time_ms": total_time_ms
            }
            background_tasks.add_task(_send_webhooks_bg, wh_data, payload)
            
        is_stream = "streamGenerateContent" in str(request.url) or (body and isinstance(body, dict) and body.get("stream", False))
        
        
        return _generate_mock_block_response(db, model_name, is_stream=is_stream, is_google_path=is_google_path, is_anthropic_path=is_anthropic_path)

    if api_key.rate_limit_rpm is not None and api_key.rate_limit_rpm > 0:
        now = time.time()
        
        if redis_client:
            redis_key = f"rate_limit:{api_key.id}"
            # Remove timestamps older than 60 seconds
            redis_client.zremrangebyscore(redis_key, 0, now - 60)
            
            # Count the remaining items
            request_count = redis_client.zcard(redis_key)
            
            if request_count >= api_key.rate_limit_rpm:
                return handle_block("BLOCK_RATE_LIMIT")
                
            # Add current request timestamp
            redis_client.zadd(redis_key, {str(now): now})
            redis_client.expire(redis_key, 60)
        else:
            # Clean up old timestamps (older than 60 seconds)
            RATE_LIMIT_STORE[api_key.id] = [t for t in RATE_LIMIT_STORE[api_key.id] if now - t < 60]
            
            if len(RATE_LIMIT_STORE[api_key.id]) >= api_key.rate_limit_rpm:
                return handle_block("BLOCK_RATE_LIMIT")
            
            # Add current request timestamp
            RATE_LIMIT_STORE[api_key.id].append(now)

    # Check budget
    if api_key.budget_limit is not None and api_key.budget_used >= api_key.budget_limit:
        return handle_block("BLOCK_BUDGET")
        
    # Get Provider API Key
    litellm_kwargs = {"temperature": body.get("temperature", 1.0)}
    if api_base:
        litellm_kwargs["api_base"] = api_base
        
    if model_provider and model_provider != "mock":
        provider_key = db.query(ProviderKey).filter(ProviderKey.provider_name == model_provider).first()
        if provider_key:
            litellm_kwargs["api_key"] = provider_key.api_key
        else:
            # We enforce having a provider key configured in the DB for security.
            # If missing, we block rather than falling back to random env variables on the server.
            raise HTTPException(status_code=500, detail=f"Missing Provider API Key for provider '{model_provider}'. Please configure it in the dashboard.")
            
    import json
    
    # Pre-flight Guardrails & Payload Normalization
    # LiteLLM expects standard OpenAI format 'messages'. If we receive Google's native 'contents' format, 
    # we must translate it inbound before passing to LiteLLM.
    messages = body.get("messages", [])
    if not messages and "contents" in body:
        # Simple inbound translation from Google Gemini format to OpenAI format
        for content_item in body["contents"]:
            role = "assistant" if content_item.get("role") == "model" else "user"
            text_parts = []
            for part in content_item.get("parts", []):
                if "text" in part:
                    text_parts.append(part["text"])
            messages.append({"role": role, "content": "\n".join(text_parts)})
        
        # Override the body messages for LiteLLM
        body["messages"] = messages
        # Remove google specific keys that confuse LiteLLM
        if "contents" in body: del body["contents"]
        if "systemInstruction" in body:
            sys_text = ""
            try:
                sys_text = body["systemInstruction"]["parts"][0]["text"]
            except Exception: pass
            if sys_text:
                messages.insert(0, {"role": "system", "content": sys_text})
            del body["systemInstruction"]
        
    try:
        pre_results = await run_pre_flight_checks(messages, db, api_key)
        guardrail_results_all.extend(pre_results)
    except GuardrailException as e:
        import json
        guardrail_results_all.extend(e.results)
        return handle_block("BLOCK_PRE_FLIGHT", json.dumps(guardrail_results_all))
    
    # Route via litellm
    try:
        pre_llm_time = time.time()
        
        litellm_model = model_name
        # Auto-prefix the model with the provider for LiteLLM routing if missing
        if model_provider and model_provider not in ["openai", "mock"] and "/" not in litellm_model:
            litellm_model = f"{model_provider}/{litellm_model}"
            
        # Detect streaming from path or body
        is_stream = "streamGenerateContent" in str(request.url) or body.get("stream", False)
        
        # Merge Litellm args with the raw body so LiteLLM can translate Google format internally
        litellm_kwargs.update(body)
        if "model" in litellm_kwargs:
            del litellm_kwargs["model"]
            
        if is_stream:
            litellm_kwargs["stream"] = True
            response_stream = await route_completion(model=litellm_model, **litellm_kwargs)
            
            # Check if this is a Google native path (v1beta/models/...)
            
            
            
            async def generate():
                import json
                stream_text = ""
                completion_tokens = 0
                async for chunk in response_stream:
                    if hasattr(chunk, "model_dump"):
                        chunk_dict = chunk.model_dump()
                    elif hasattr(chunk, "dict"):
                        chunk_dict = chunk.dict()
                    else:
                        chunk_dict = dict(chunk)
                        
                    if is_google_path:
                        # Translate OpenAI stream chunk to Google native chunk
                        text = ""
                        try:
                            text = chunk_dict["choices"][0]["delta"].get("content", "")
                        except Exception:
                            pass
                            
                        google_chunk = {
                            "candidates": [
                                {
                                    "content": {
                                        "parts": [{"text": text}],
                                        "role": "model"
                                    },
                                    "finishReason": chunk_dict["choices"][0].get("finish_reason") or "STOP" if text else None
                                }
                            ]
                        }
                        if not text and chunk_dict["choices"][0].get("finish_reason"):
                            google_chunk["candidates"][0]["finishReason"] = chunk_dict["choices"][0]["finish_reason"].upper()
                            
                        chunk_str = json.dumps(google_chunk)
                        yield f"data: {chunk_str}\n\n"
                    elif is_anthropic_path:
                        text = ""
                        try:
                            text = chunk_dict["choices"][0]["delta"].get("content", "")
                        except Exception:
                            pass
                            
                        # Extremely simplified translation to avoid SDK crashes. 
                        # Anthropic expects specific events. If we just send content_block_delta it might be enough,
                        # or we might need message_start etc. 
                        if not getattr(generate, "started", False):
                            generate.started = True
                            start_chunk = {"type": "message_start", "message": {"id": chunk_dict.get("id", "msg"), "type": "message", "role": "assistant", "content": [], "model": litellm_model, "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0}}}
                            yield f"event: message_start\ndata: {json.dumps(start_chunk)}\n\n"
                            
                            block_start = {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
                            yield f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n"

                        if text:
                            anthropic_chunk = {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}}
                            yield f"event: content_block_delta\ndata: {json.dumps(anthropic_chunk)}\n\n"
                            
                        if chunk_dict["choices"][0].get("finish_reason"):
                            block_stop = {"type": "content_block_stop", "index": 0}
                            yield f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n"
                            
                            msg_delta = {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 0}}
                            yield f"event: message_delta\ndata: {json.dumps(msg_delta)}\n\n"
                            
                            msg_stop = {"type": "message_stop"}
                            yield f"event: message_stop\ndata: {json.dumps(msg_stop)}\n\n"
                    else:
                        chunk_str = json.dumps(chunk_dict)
                        yield f"data: {chunk_str}\n\n"
                
                    if text: stream_text += text
                    # Rough token estimate for stream
                    completion_tokens += 1
                
                # OpenAI uses data: [DONE], but Google/Anthropic SDKs don't expect it in the same way.
                if not is_google_path and not is_anthropic_path:
                    yield "data: [DONE]\n\n" 
                
                # Stream finished, save audit log
                post_llm_time = time.time()
                llm_time_ms = (post_llm_time - pre_llm_time) * 1000
                total_time_ms = (time.time() - request_start_time) * 1000
                gateway_processing_time_ms = total_time_ms - llm_time_ms
                
                # Try to use litellm standard token counter if we imported it, otherwise fallback
                import litellm
                try:
                    p_tokens = litellm.token_counter(model=litellm_model, messages=messages)
                    c_tokens = litellm.token_counter(model=litellm_model, text=stream_text)
                except:
                    p_tokens = 0
                    c_tokens = completion_tokens
                    
                cost = (p_tokens + c_tokens) * 0.0001
                
                try:
                    with SessionLocal() as db_session:
                        log = AuditLog(
                            api_key_id=api_key.id,
                            model_used=model_name,
                            cost_center=cost_center,
                            tokens_prompt=p_tokens,
                            tokens_completion=c_tokens,
                            cost=cost,
                            action="ALLOW",
                            timestamp=request_received_at,
                            response_sent_at=datetime.now(timezone.utc),
                            gateway_processing_time_ms=gateway_processing_time_ms,
                            llm_time_ms=llm_time_ms,
                            request_payload=request_payload_json,
                            response_payload=stream_text, # raw text for stream
                            guardrail_results=json.dumps(guardrail_results_all)
                        )
                        db_session.add(log)
                        api_key_db = db_session.query(APIKey).filter(APIKey.id == api_key.id).first()
                        if api_key_db:
                            api_key_db.budget_used += cost
                        db_session.commit()
                except Exception as e:
                    print(f"Error saving stream audit log: {e}")
                
            return StreamingResponse(generate(), media_type="text/event-stream")
            
        response = await route_completion(model=litellm_model, **litellm_kwargs)
        post_llm_time = time.time()
        
        llm_time_ms = (post_llm_time - pre_llm_time) * 1000
        
        # litellm provides usage and response text
        prompt_tokens = response.get("usage", {}).get("prompt_tokens", 0)
        completion_tokens = response.get("usage", {}).get("completion_tokens", 0)
        
        # Post-flight Guardrails
        response_content = response["choices"][0]["message"]["content"]
        
        if is_anthropic_path:
            # Reformat outbound flat response to Anthropic style
            response = {
                "id": response.get("id", "msg_123"),
                "type": "message",
                "role": "assistant",
                "model": litellm_model,
                "content": [{"type": "text", "text": response_content}],
                "stop_reason": "end_turn" if response["choices"][0].get("finish_reason") == "stop" else response["choices"][0].get("finish_reason"),
                "stop_sequence": None,
                "usage": {"input_tokens": prompt_tokens, "output_tokens": completion_tokens}
            }
        completion_tokens = response.get("usage", {}).get("completion_tokens", 0)
        
        # In a real app we'd use litellm.completion_cost or similar, but let's calculate standard mock rate or litellm response cost
        cost = response.get("_hidden_params", {}).get("response_cost", (prompt_tokens + completion_tokens) * 0.0001)
        if isinstance(cost, str): cost = float(cost) # fallback
        
        # Post-flight Guardrails
        response_content = response["choices"][0]["message"]["content"]
        
        # litellm returns a ModelResponse object which behaves like a dict but isn't natively json serializable.
        # We need to convert it to a standard dict first, or use its built-in serialization if available.
        response_payload_json = response.model_dump_json() if hasattr(response, "model_dump_json") else json.dumps(dict(response))
        
        try:
            post_results = await run_post_flight_checks(response_content, db, api_key)
            guardrail_results_all.extend(post_results)
        except GuardrailException as e:
            guardrail_results_all.extend(e.results)
            return handle_block("BLOCK_POST_FLIGHT", json.dumps(guardrail_results_all))
            
        # Update budget and log audit
        api_key.budget_used += cost
        
        total_time_ms = (time.time() - request_start_time) * 1000
        gateway_processing_time_ms = total_time_ms - llm_time_ms
        
        log = AuditLog(
            api_key_id=api_key.id,
            model_used=model_name,
            cost_center=cost_center,
            tokens_prompt=prompt_tokens,
            tokens_completion=completion_tokens,
            cost=cost,
            action="ALLOW",
            timestamp=request_received_at,
            response_sent_at=datetime.now(timezone.utc),
            gateway_processing_time_ms=gateway_processing_time_ms,
            llm_time_ms=llm_time_ms,
            request_payload=request_payload_json,
            response_payload=response_payload_json,
            guardrail_results=json.dumps(guardrail_results_all)
        )
        db.add(log)
        db.commit()

        return response
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
            
        status_code = getattr(e, "status_code", 500)
        # Some litellm exceptions have a message or detail attribute
        detail = getattr(e, "message", str(e))
        
        # Format Anthropic native errors if requested on Anthropic path
        if is_anthropic_path:
            return JSONResponse(
                status_code=status_code,
                content={
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": str(detail)
                    }
                }
            )
            
        raise HTTPException(status_code=status_code, detail=str(detail))
