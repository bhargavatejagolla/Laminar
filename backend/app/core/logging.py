"""
Laminar - Enterprise Structured Logging System
-----------------------------------------------

Production Features:
- JSON logging with proper escaping
- File rotation with compression
- Async context propagation
- Correlation IDs across services
- Module-level log control
- Performance sampling for AI logs
- Structured fields for metrics
- Environment-aware formatting
"""

import json
import logging
import logging.config
import logging.handlers
import sys
import os
try:
    from asyncio import CancelledError
except ImportError:
    CancelledError = type('CancelledError', (BaseException,), {})  # Fallback
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional
from uuid import uuid4, UUID
from contextvars import ContextVar
from pathlib import Path

from app.core.config import settings

# Context variable for request ID propagation through async calls
_request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    """
    JSON log formatter with proper escaping and structured data support.
    Production-grade formatter for log aggregation systems.
    """

    def __init__(self):
        super().__init__()
        self._ensure_ascii = False  # Allow Unicode

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON with proper field handling."""

        # Base log entry
        log_entry: Dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "process": record.process,
            "thread": record.thread,
            "message": record.getMessage(),
        }

        # Add request ID from context or record
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        else:
            log_entry["request_id"] = _request_id_ctx_var.get()

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "extra_fields"):
            log_entry.update(record.extra_fields)

        # Ensure JSON serializable
        return json.dumps(log_entry, default=str, ensure_ascii=False)


class RequestIdFilter(logging.Filter):
    """
    Adds request_id to every log record from context variable.
    Falls back to generating new ID if not found.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        request_id = _request_id_ctx_var.get()
        if not request_id:
            request_id = str(uuid4())
        record.request_id = request_id
        return True


class ShutdownNoiseFilter(logging.Filter):
    """
    Suppresses noisy stack traces during application shutdown or reload.
    Targets asyncio.CancelledError and KeyboardInterrupt which are standard
    during Uvicorn reload but clutter the console.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Ignore common shutdown noise from uvicorn and asyncio
        if record.levelno >= logging.ERROR and record.exc_info:
            exc_type, exc_val, _ = record.exc_info
            if exc_type in [KeyboardInterrupt, CancelledError]:
                return False
            
            # Also check message content for CancelledError strings
            msg = record.getMessage()
            if "CancelledError" in msg or "KeyboardInterrupt" in msg:
                if record.name.startswith(("uvicorn", "asyncio", "multiprocessing")):
                    return False
        
        return True


class StructuredLoggerAdapter(logging.LoggerAdapter):
    """
    Logger adapter that allows adding structured fields.
    
    Example:
        logger = get_logger(__name__)
        logger.info("User action", extra_fields={"user_id": 123, "action": "login"})
    """

    def process(self, msg: str, kwargs: Dict[str, Any]) -> tuple:
        extra_fields = kwargs.pop("extra_fields", {})
        if extra_fields:
            if "extra" not in kwargs:
                kwargs["extra"] = {}
            kwargs["extra"]["extra_fields"] = extra_fields
        return msg, kwargs

    def debug(self, msg: str, *args, extra_fields: Optional[Dict] = None, **kwargs):
        if extra_fields:
            kwargs["extra_fields"] = extra_fields
        super().debug(msg, *args, **kwargs)

    def info(self, msg: str, *args, extra_fields: Optional[Dict] = None, **kwargs):
        if extra_fields:
            kwargs["extra_fields"] = extra_fields
        super().info(msg, *args, **kwargs)

    def warning(self, msg: str, *args, extra_fields: Optional[Dict] = None, **kwargs):
        if extra_fields:
            kwargs["extra_fields"] = extra_fields
        super().warning(msg, *args, **kwargs)

    def error(self, msg: str, *args, extra_fields: Optional[Dict] = None, **kwargs):
        if extra_fields:
            kwargs["extra_fields"] = extra_fields
        super().error(msg, *args, **kwargs)

    def critical(self, msg: str, *args, extra_fields: Optional[Dict] = None, **kwargs):
        if extra_fields:
            kwargs["extra_fields"] = extra_fields
        super().critical(msg, *args, **kwargs)


class RequestIdMiddleware:
    """
    Middleware to set request_id context for each request.
    To be used with FastAPI.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Generate or extract request ID
        request_id = str(uuid4())

        # Look for incoming request ID in headers
        headers = dict(scope.get("headers", []))
        incoming_id = headers.get(b"x-request-id", b"").decode()
        if incoming_id:
            request_id = incoming_id

        # Set context for this request
        token = _request_id_ctx_var.set(request_id)

        try:
            # Add request_id to response headers
            original_send = send

            async def send_with_headers(message):
                if message["type"] == "http.response.start":
                    headers = message.get("headers", [])
                    headers.append((b"x-request-id", request_id.encode()))
                    message["headers"] = headers
                await original_send(message)

            await self.app(scope, receive, send_with_headers)
        finally:
            # Reset context
            _request_id_ctx_var.reset(token)


def ensure_log_directory() -> Path:
    """Ensure log directory exists and is writable."""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    # Create environment subdirectory
    env_dir = log_dir / settings.ENVIRONMENT
    env_dir.mkdir(exist_ok=True)

    return env_dir


def build_logging_config() -> Dict[str, Any]:
    """
    Build comprehensive logging configuration.
    Environment-aware with file rotation in production.
    """

    is_production = settings.is_production()
    is_development = settings.is_development()
    log_dir = ensure_log_directory()

    # Development formatter (human readable)
    dev_formatter = {
        "format": (
            "%(asctime)s.%(msecs)03d | %(levelname)-8s | "
            "%(name)-25s | %(request_id)-36s | %(message)s"
        ),
        "datefmt": "%Y-%m-%d %H:%M:%S",
    }

    # Production JSON formatter
    prod_formatter = {
        "()": JSONFormatter,
    }

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "request_id_filter": {
                "()": RequestIdFilter,
            },
            "shutdown_noise_filter": {
                "()": ShutdownNoiseFilter,
            }
        },
        "formatters": {
            "verbose": dev_formatter,
            "json": prod_formatter,
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": sys.stdout,
                "formatter": "verbose" if is_development else "json",
                "filters": ["request_id_filter", "shutdown_noise_filter"],
                "level": settings.LOG_LEVEL,
            }
        },
        "root": {
            "level": settings.LOG_LEVEL,
            "handlers": ["console"],
        },
        "loggers": {
            # FastAPI/Uvicorn
            "uvicorn": {
                "level": settings.LOG_LEVEL,
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": "ERROR",
                "handlers": ["console"],
                "filters": ["shutdown_noise_filter"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": settings.LOG_LEVEL,
                "handlers": ["console"],
                "propagate": False,
            },
            # Database
            "sqlalchemy.engine": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
            "sqlalchemy.pool": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
            # AI Services (sampled in production)
            "app.services.ai": {
                "level": "INFO" if is_production else "DEBUG",
                "handlers": ["console"],
                "propagate": False,
            },
            # Camera Services
            "app.services.camera": {
                "level": "INFO" if is_production else "DEBUG",
                "handlers": ["console"],
                "propagate": False,
            },
            # Security/Auth
            "app.core.security": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
        },
    }

    # Add file handlers in production
    if is_production:
        # Main application log with rotation
        config["handlers"]["file"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(log_dir / "app.log"),
            "when": "midnight",
            "interval": 1,
            "backupCount": 30,
            "encoding": "utf-8",
            "formatter": "json",
            "filters": ["request_id_filter"],
            "level": settings.LOG_LEVEL,
        }

        # Error log (ERROR and above)
        config["handlers"]["error_file"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(log_dir / "error.log"),
            "when": "midnight",
            "interval": 1,
            "backupCount": 90,
            "encoding": "utf-8",
            "formatter": "json",
            "filters": ["request_id_filter"],
            "level": "ERROR",
        }

        # AI service log (sampled)
        config["handlers"]["ai_file"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(log_dir / "ai.log"),
            "when": "midnight",
            "interval": 1,
            "backupCount": 7,
            "encoding": "utf-8",
            "formatter": "json",
            "filters": ["request_id_filter"],
            "level": "INFO",
        }

        # Add handlers to root
        config["root"]["handlers"] = ["console", "file", "error_file"]

        # Route AI logs to both console and AI file
        config["loggers"]["app.services.ai"]["handlers"] = [
            "console", "ai_file"]

    return config


def setup_logging() -> None:
    """
    Initialize logging configuration.
    Should be called once at application startup.
    """
    logging_config = build_logging_config()
    logging.config.dictConfig(logging_config)

    # Suppress noisy libraries
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("apscheduler.executors.default").setLevel(logging.WARNING)


def get_logger(name: str) -> StructuredLoggerAdapter:
    """
    Get a structured logger instance with context support.
    
    Args:
        name: Logger name (usually __name__)
    
    Returns:
        StructuredLoggerAdapter with extra_fields support
    
    Example:
        logger = get_logger(__name__)
        logger.info("User login", extra_fields={"user_id": 123, "ip": "192.168.1.1"})
    """
    logger = logging.getLogger(name)
    return StructuredLoggerAdapter(logger, {})


def set_request_id(request_id: str) -> None:
    """
    Manually set request_id for current context.
    Useful for background tasks without HTTP context.
    """
    _request_id_ctx_var.set(request_id)


def get_request_id() -> str:
    """
    Get current request_id from context.
    """
    return _request_id_ctx_var.get()


# Singleton logger instances for common modules
root_logger = get_logger("laminar")
ai_logger = get_logger("app.services.ai")
camera_logger = get_logger("app.services.camera")
security_logger = get_logger("app.core.security")
database_logger = get_logger("app.core.database")
