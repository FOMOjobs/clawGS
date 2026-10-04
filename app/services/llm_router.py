import litellm

# Set litellm to not drop params unless needed
litellm.drop_params = True
litellm.set_verbose = True
litellm._turn_on_debug()

async def route_completion(model: str, **kwargs):
    """
    Wrapper around litellm.acompletion to handle routing.
    """
    if model == "mock-model" or model.startswith("mock/"):
        # Built-in mock provider for testing
        return {
            "id": "mock-123",
            "choices": [{"message": {"role": "assistant", "content": "This is a mock response."}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 10},
            "_hidden_params": {"response_cost": 0.002}
        }
    
    # Extract messages if provided explicitly or in kwargs (Google fallback)
    messages = kwargs.pop("messages", [])
    
    # If the payload was Google native format, litellm supports converting it but we might just pass kwargs raw
    if not messages and "contents" in kwargs:
        response = await litellm.acompletion(
            model=model,
            **kwargs
        )
    else:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            **kwargs
        )
        
    return response
