from typing import List, Union, Optional
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Control Layer Gateway"
    API_V1_STR: str = "/v1"
    
    # BACKEND_CORS_ORIGINS is a JSON-formatted list of origins
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Database
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///./ai_gateway.db"
    FRONTEND_URL: str = "http://localhost:5173"
    ENCRYPTION_KEY: str = "4S0EvmpiDAea7kCRKQN-WPqK8dhR9aOlgkbhMtzbVkc="
    REDIS_URL: Optional[str] = None

    class Config:
        case_sensitive = True

settings = Settings()
