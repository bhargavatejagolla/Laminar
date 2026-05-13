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


class TenantMiddleware:
    """
    Extracts tenant_id from JWT and injects into request scope.
    ASGI-compatible: skips non-HTTP requests (like WebSockets) to avoid handshake timeouts.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            # Skip for WebSockets and other protocols
            await self.app(scope, receive, send)
            return

        # Initialize tenant_id in scope state
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["tenant_id"] = None

        if MULTI_TENANT_ENABLED:
            try:
                # Extract headers from ASGI scope
                headers = dict(scope.get("headers", []))
                auth = headers.get(b"authorization", b"").decode()
                
                if auth.startswith("Bearer "):
                    token = auth[7:]
                    payload = decode_token(token)
                    tenant_id_str = payload.get("tenant_id")
                    if tenant_id_str:
                        scope["state"]["tenant_id"] = str(tenant_id_str)
            except Exception:
                pass  # Fail open

        await self.app(scope, receive, send)


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
