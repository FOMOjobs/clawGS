import re
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.guardrail import GuardrailPolicy

class GuardrailException(HTTPException):
    def __init__(self, message: str, status_code: int, results: list):
        super().__init__(status_code=status_code, detail=message)
        self.results = results

async def evaluate_policy(policy, content: str) -> tuple[bool, dict]:
    import time
    details = {}
    
    if policy.type == "regex":
        pattern = policy.config.get("pattern")
        if pattern and re.search(pattern, content, re.IGNORECASE):
            return False, details
    elif policy.type == "keyword":
        keywords = policy.config.get("keywords", [])
        for keyword in keywords:
            if keyword.lower() in content:
                return False, details
    elif policy.type == "dm":
        instruction = policy.config.get("instruction", "")
        threshold = float(policy.config.get("noul_threshold", 0.5))
        
        payload = {
            "text": content,
            "instruction": instruction
        }
        details["dm_request"] = payload
        
        try:
            import httpx
            start_time = time.time()
            async with httpx.AsyncClient() as client:
                resp = await client.post("http://clawgs.lisowska26.com:8000/predict", json=payload, timeout=20.0)
                latency = int((time.time() - start_time) * 1000)
                details["dm_latency_ms"] = latency
                
                if resp.status_code == 200:
                    data = resp.json()
                    details["dm_response"] = data
                    answers = data.get("answers", {})
                    if answers:
                        first_key = list(answers.keys())[0]
                        noul_val = answers[first_key].get("noul", 0.0)
                        details["dm_score"] = noul_val
                        if noul_val >= threshold:
                            return False, details # Block request
        except Exception as e:
            details["dm_error"] = str(e)
            pass # Fail open if DM service is down
    return True, details

async def run_pre_flight_checks(messages: list, db: Session, api_key) -> list:
    """
    Run pre-flight guardrails before sending to the LLM.
    Returns a list of evaluated policy results.
    Raises GuardrailException if a blocking check fails.
    """
    global_policies = db.query(GuardrailPolicy).filter(
        GuardrailPolicy.target == "pre-flight",
        GuardrailPolicy.is_active == True,
        GuardrailPolicy.is_global == True
    ).all()
    
    # Get key-specific policies that are active and target pre-flight, preserving the order defined in api_key.policies
    key_policies = [p for p in api_key.policies if p.target == "pre-flight" and p.is_active and not p.is_global]
    
    active_policies = global_policies + key_policies

    results = []
    any_blocked = False
    failed_names = []

    for policy in active_policies:
        passed = True
        for msg in messages:
            raw_content = msg.get("content", "")
            # Anthropic and multimodal APIs can pass lists of objects in 'content' instead of just a string
            if isinstance(raw_content, list):
                # Extract text blocks
                text_parts = []
                for part in raw_content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = " ".join(text_parts).lower()
            else:
                content = str(raw_content).lower()
                
            passed, details = await evaluate_policy(policy, content)
            if not passed:
                break
        
        status = "pass" if passed else "fail"
        res_obj = {"name": policy.name, "target": policy.target, "status": status}
        if details:
            res_obj["details"] = details
        results.append(res_obj)
        
        if not passed and policy.action == "block":
            any_blocked = True
            failed_names.append(policy.name)
            break # Fast fail: stop processing further policies if one blocks

    if any_blocked:
        raise GuardrailException(f"Pre-flight guardrail triggered: {', '.join(failed_names)}", 400, results)

    return results


async def run_post_flight_checks(response_content: str, db: Session, api_key) -> list:
    """
    Run post-flight guardrails before returning the LLM response.
    Returns a list of evaluated policy results.
    Raises GuardrailException if a blocking check fails.
    """
    global_policies = db.query(GuardrailPolicy).filter(
        GuardrailPolicy.target == "post-flight",
        GuardrailPolicy.is_active == True,
        GuardrailPolicy.is_global == True
    ).all()
    
    key_policies = [p for p in api_key.policies if p.target == "post-flight" and p.is_active and not p.is_global]
    
    active_policies = global_policies + key_policies

    content = response_content.lower()
    results = []
    any_blocked = False
    failed_names = []

    for policy in active_policies:
        passed, details = await evaluate_policy(policy, content)
        status = "pass" if passed else "fail"
        res_obj = {"name": policy.name, "target": policy.target, "status": status}
        if details:
            res_obj["details"] = details
        results.append(res_obj)
        
        if not passed and policy.action == "block":
            any_blocked = True
            failed_names.append(policy.name)
            break # Fast fail: stop processing further policies if one blocks

    if any_blocked:
        raise GuardrailException(f"Post-flight guardrail triggered: {', '.join(failed_names)}", 500, results)

    return results


import json

async def run_mcp_pre_flight_checks(mcp_request: dict, db: Session, api_key) -> list:
    global_policies = db.query(GuardrailPolicy).filter(
        GuardrailPolicy.target == "mcp-pre-flight",
        GuardrailPolicy.is_active == True,
        GuardrailPolicy.is_global == True
    ).all()
    
    key_policies = [p for p in api_key.policies if p.target == "mcp-pre-flight" and p.is_active and not p.is_global]
    
    active_policies = global_policies + key_policies

    req_str = json.dumps(mcp_request).lower()
    
    # Extract tool name if it's a tool call
    tool_name = ""
    if mcp_request.get("method") == "tools/call":
        tool_name = mcp_request.get("params", {}).get("name", "").lower()

    results = []
    any_blocked = False
    failed_names = []

    for policy in active_policies:
        passed = True
        
        details = {}
        if policy.type == "mcp_tool_name":
            target_tool = policy.config.get("tool_name", "").lower()
            if target_tool and target_tool == tool_name:
                passed = False
        else:
            # Fallback to standard regex/keyword on the JSON string
            passed, details = await evaluate_policy(policy, req_str)
        
        status = "pass" if passed else "fail"
        res_obj = {"name": policy.name, "target": policy.target, "status": status}
        if details:
            res_obj["details"] = details
        results.append(res_obj)
        
        if not passed and policy.action == "block":
            any_blocked = True
            failed_names.append(policy.name)
            break # Fast fail: stop processing further policies if one blocks

    if any_blocked:
        raise GuardrailException(f"MCP Pre-flight guardrail triggered: {', '.join(failed_names)}", 400, results)

    return results
