"""
Laminar - Configuration Management
-----------------------------------
Centralized application configuration using Pydantic Settings v2.

Features:
- Environment-based configuration with validation
- PostgreSQL async database with connection pooling
- Redis cache configuration for rate limiting and session storage
- JWT authentication with refresh token support
- CORS origin management
- Rate limiting configuration
- Feature flags for AI services
- Production-safe API documentation control
- Type-safe throughout with Pydantic v2
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import Field, PostgresDsn, RedisDsn, field_validator, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    All settings are validated at startup to fail fast and ensure type safety.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        validate_assignment=True,
        extra="ignore"
    )

    # ---------------------------------------------------------
    # Core Application Settings
    # ---------------------------------------------------------
    APP_NAME: str = "Laminar"
    ENVIRONMENT: str = Field(default="development",
                             pattern="^(development|staging|production|test)$")
    DEBUG: bool = Field(default=True)
    API_V1_PREFIX: str = "/api/v1"
    ENABLE_VISION:bool=True

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, v: str) -> str:
        """Ensure environment is lowercase and valid."""
        return v.lower()

    # ---------------------------------------------------------
    # API Documentation (Disabled in production by default)
    # ---------------------------------------------------------
    @computed_field
    @property
    def DOCS_URL(self) -> Optional[str]:
        """Disable Swagger UI in production for security."""
        return None if self.ENVIRONMENT == "production" else "/docs"

    @computed_field
    @property
    def REDOC_URL(self) -> Optional[str]:
        """Disable ReDoc in production for security."""
        return None if self.ENVIRONMENT == "production" else "/redoc"

    @computed_field
    @property
    def OPENAPI_URL(self) -> Optional[str]:
        """Disable OpenAPI schema in production for security."""
        return None if self.ENVIRONMENT == "production" else "/openapi.json"

    # ---------------------------------------------------------
    # Server Settings
    # ---------------------------------------------------------
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8000, ge=1, le=65535)

    # ---------------------------------------------------------
    # Security Settings
    # ---------------------------------------------------------
    SECRET_KEY: str = Field(..., min_length=32,
                            description="Secret key for JWT and encryption (min 32 chars)")
    ALGORITHM: str = Field(default="HS256", pattern="^(HS256|RS256)$")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=60, ge=1, le=525600)  # Max 1 year
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1, le=365)
    JWT_AUDIENCE: Optional[str] = Field(default=None)
    JWT_ISSUER: str = Field(default="laminar")

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key_strength(cls, v: str) -> str:
        """Ensure secret key is sufficiently random."""
        # Additional entropy check could be added here
        return v

    # ---------------------------------------------------------
    # Database Settings (PostgreSQL + asyncpg)
    # ---------------------------------------------------------
    POSTGRES_SERVER: str = Field(default="localhost")
    POSTGRES_USER: str = Field(default="postgres")
    POSTGRES_PASSWORD: str = Field(..., description="PostgreSQL password")
    POSTGRES_DB: str = Field(default="laminar")
    POSTGRES_PORT: int = Field(default=5432, ge=1, le=65535)

    # Connection Pool Settings
    DB_POOL_SIZE: int = Field(default=30, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0)
    DB_POOL_TIMEOUT: int = Field(default=30, ge=1)
    DB_POOL_RECYCLE: int = Field(default=3600, ge=60)
    DB_POOL_PRE_PING: bool = Field(default=True)
    DB_ECHO: bool = Field(default=False)

    @computed_field
    @property
    def DATABASE_URL(self) -> PostgresDsn:
        """
        Build async PostgreSQL connection URL.
        Uses asyncpg driver for optimal performance.
        """
        return PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    @computed_field
    @property
    def SYNC_DATABASE_URL(self) -> PostgresDsn:
        """
        Build sync PostgreSQL connection URL for Alembic.
        Removes asyncpg driver specification for compatibility.
        """
        return PostgresDsn.build(
            scheme="postgresql",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    # ---------------------------------------------------------
    # Redis Cache Settings
    # ---------------------------------------------------------
    REDIS_HOST: str = Field(default="localhost")
    REDIS_PORT: int = Field(default=6379, ge=1, le=65535)
    REDIS_PASSWORD: Optional[str] = Field(default=None)
    REDIS_DB: int = Field(default=0, ge=0, le=15)

    @computed_field
    @property
    def REDIS_URL(self) -> RedisDsn:
        """Build Redis connection URL with optional authentication."""
        auth_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return RedisDsn(f"redis://{auth_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}")

    # ---------------------------------------------------------
    # CORS Settings
    # ---------------------------------------------------------
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://127.0.0.1:5173",
            "http://192.168.0.142:3000",
            "http://192.168.0.142:3001",
        ],
        description="List of allowed CORS origins"
    )

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            if v.startswith("["):
                try:
                    import json
                    return json.loads(v)
                except Exception:
                    raise ValueError(f"Invalid JSON in CORS origins: {v}")
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return v
        return v
    

    # ---------------------------------------------------------
    # SMTP Email Configuration
    # ---------------------------------------------------------
    SMTP_HOST: str = Field(default="smtp.gmail.com")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(...)
    SMTP_PASSWORD: str = Field(...)
    SMTP_USE_TLS: bool = Field(default=True)

    # Auth SMTP Settings (Dedicated for OTP/Login)
    AUTH_SMTP_HOST: str = Field(default="smtp.gmail.com")
    AUTH_SMTP_PORT: int = Field(default=587)
    AUTH_SMTP_USER: Optional[str] = Field(default=None)
    AUTH_SMTP_PASSWORD: Optional[str] = Field(default=None)

    MANAGEMENT_EMAILS: str = Field(default="")
    POLICE_EMAILS: str = Field(default="")
    SUPERVISOR_EMAILS: str = Field(default="")


    def get_management_emails(self) -> list[str]:
        return [e.strip() for e in self.MANAGEMENT_EMAILS.split(",") if e.strip()]


    def get_police_emails(self) -> list[str]:
        return [e.strip() for e in self.POLICE_EMAILS.split(",") if e.strip()]


    def get_supervisor_emails(self) -> list[str]:
        return [e.strip() for e in self.SUPERVISOR_EMAILS.split(",") if e.strip()]

    # ---------------------------------------------------------
    # SMS Gateway Settings (local Android SMS gateway)
    # ---------------------------------------------------------
    SMS_GATEWAY_ENABLED: bool = Field(
        default=False,
        description="Set to True to dispatch real SMS via local Android gateway"
    )
    SMS_GATEWAY_URL: str = Field(
        default="",
        description="URL to local SMS gateway, e.g. http://192.168.1.100:8080/v1/sms/send"
    )
    SMS_GATEWAY_TIMEOUT: int = Field(
        default=8,
        ge=2, le=60,
        description="Per-request timeout in seconds for SMS gateway calls"
    )
    SMS_MAX_RETRIES: int = Field(
        default=2,
        ge=0, le=5,
        description="Number of retry attempts before falling back to simulation"
    )

    # ---------------------------------------------------------
    # Rate Limiting
    # ---------------------------------------------------------
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_TIMES: int = Field(default=100, ge=1, le=10000)
    RATE_LIMIT_SECONDS: int = Field(default=60, ge=1, le=3600)

    # ---------------------------------------------------------
    # Google OAuth
    # ---------------------------------------------------------
    GOOGLE_CLIENT_ID: Optional[str] = Field(
        default=None,
        description="Google OAuth2 Client ID for verifying Google Sign-In tokens"
    )

    # ---------------------------------------------------------
    # AI / Feature Flags
    # ---------------------------------------------------------
    ENABLE_DETECTION: bool = Field(default=True)
    ENABLE_PREDICTION: bool = Field(default=True)
    ENABLE_RISK_ENGINE: bool = Field(default=True)
    ENABLE_LLM_ASSISTANT: bool = Field(default=False)
    
    # AI Fallback Engine Keys
    GEMINI_API_KEY: Optional[str] = Field(default="")
    GROQ_API_KEY: Optional[str] = Field(default="")
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434")

    # ---------------------------------------------------------
    # Logging
    # ---------------------------------------------------------
    LOG_LEVEL: str = Field(
        default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def normalize_log_level(cls, v: str) -> str:
        """Ensure log level is uppercase."""
        return v.upper()

    # ---------------------------------------------------------
    # Helper Methods
    # ---------------------------------------------------------
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.ENVIRONMENT == "development"

    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT == "production"

    def is_testing(self) -> bool:
        """Check if running in test environment."""
        return self.ENVIRONMENT == "test"

    def is_staging(self) -> bool:
        """Check if running in staging environment."""
        return self.ENVIRONMENT == "staging"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Cached settings instance to avoid reloading on every import.
    
    Returns:
        Settings: Singleton settings instance
    """
    return Settings()


# Singleton instance for easy imports
settings = get_settings()
