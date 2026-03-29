"""
Laminar - Tenant Middleware
----------------------------
Injects tenant_id from JWT claims into request state for query-level isolation.

Multi-tenant mode is BACKWARD COMPATIBLE:
  - If JWT has no tenant_id claim → single-tenant mode (existing behavior unchanged)
  - If JWT has tenant_id → all service queries should filter by it
  - tenant_id = None means "no isolation" (single-tenant / admin access)

Usage in service layer:
    tenant_id = request.state.tenant_id  # None in single-tenant mode
    stmt = select(Venue).where(
        Venue.tenant_id == tenant_id if tenant_id else True
    )

To enable multi-tenant mode:
    1. Add tenant_id field to JWT on login
    2. Set MULTI_TENANT_ENABLED=true in .env
"""

import os
from typing import Optional
from uuid import UUID

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.security import decode_token
from app.core.logging import get_logger

logger = get_logger(__name__)

MULTI_TENANT_ENABLED = os.getenv("MULTI_TENANT_ENABLED", "false").lower() == "true"


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Extracts tenant_id from JWT and injects into request.state.
    Runs on every request — lightweight (no DB call).

    If multi-tenant mode is disabled → request.state.tenant_id = None
    If JWT parsing fails → request.state.tenant_id = None (fail open)
    """

    async def dispatch(self, request: Request, call_next):
        request.state.tenant_id = None  # Default: single-tenant

        if MULTI_TENANT_ENABLED:
            try:
                auth = request.headers.get("Authorization", "")
                if auth.startswith("Bearer "):
                    token = auth[7:]
                    payload = decode_token(token)
                    tenant_id_str = payload.get("tenant_id")
                    if tenant_id_str:
                        request.state.tenant_id = str(tenant_id_str)
            except Exception:
                pass  # Fail open — authentication is handled by dependency injection

        response = await call_next(request)
        return response


def get_tenant_id(request: Request) -> Optional[str]:
    """
    FastAPI dependency that returns the current tenant_id from request state.
    Returns None in single-tenant mode.

    Usage:
        @router.get("/venues")
        async def list_venues(
            tenant_id: Optional[str] = Depends(get_tenant_id),
            session: AsyncSession = Depends(get_db),
        ):
            ...
    """
    return getattr(request.state, "tenant_id", None)
