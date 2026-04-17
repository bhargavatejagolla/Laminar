from datetime import datetime, timezone
from uuid import UUID

from app.models.crowd_alert import CrowdAlert
from app.services.notification_service import NotificationService


###############################################################################################################################





from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import db_manager
from app.core.dependencies import require_role, get_current_active_user
from app.models.crowd_alert import CrowdAlert
from app.models.user import UserRole
from app.schemas.alert import AlertResponse

router = APIRouter(prefix="/alerts", tags=["Alerts"])

def verify_alert_access(alert: CrowdAlert, user):
    if not user.is_super_admin:
        if str(alert.venue_id) not in [str(v.id) for v in user.venues]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized for this alert's Location Matrix"
            )


# ==========================================================
# Database Dependency
# ==========================================================

async def get_db() -> AsyncSession:
    async with db_manager.session() as session:
        yield session


# ==========================================================
# List Alerts
# ==========================================================

@router.get("", response_model=List[AlertResponse])
async def list_alerts(
    status_filter: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_active_user),
):
    """
    List alerts.
    - Any authenticated user can view.
    - Supports pagination.
    - Optional status filtering.
    """

    # Default: show all alerts (including resolved for history) unless overridden
    query = select(CrowdAlert)

    # If user explicitly requests a status
    if status_filter:
        query = select(CrowdAlert).where(CrowdAlert.status == status_filter)

    if not user.is_super_admin:
        allowed_venue_ids = {str(v.id) for v in user.venues}
        query = query.where(CrowdAlert.venue_id.in_(list(allowed_venue_ids)))

    # Add pagination and execution
    query = query.offset(skip).limit(limit).order_by(CrowdAlert.created_at.desc())
    
    result = await db.execute(query)
    alerts = result.scalars().all()

    return [AlertResponse.model_validate(alert) for alert in alerts]


# ==========================================================
# Acknowledge Alert (Operator+)
# ==========================================================

@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Acknowledge an alert.
    - Admin or higher.
    """

    alert = await db.get(CrowdAlert, alert_id)

    if not alert :
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_alert_access(alert, user)

    alert.status = "acknowledged"
    await db.commit()
    await db.refresh(alert)

    return AlertResponse.model_validate(alert)


# ==========================================================
# Resolve Alert (Manager+)
# ==========================================================

@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    """
    Resolve an alert.
    - Admin or higher.
    """

    alert = await db.get(CrowdAlert, alert_id)

    if not alert :
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_alert_access(alert, user)

    alert.status = "resolved"
    await db.commit()
    await db.refresh(alert)

    return AlertResponse.model_validate(alert)


# ==========================================================
# Soft Delete Alert (Admin Only)
# ==========================================================

@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """
    Soft delete alert.
    - Super Admin only.
    """

    alert = await db.get(CrowdAlert, alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_alert_access(alert, user)

    alert.soft_delete()
    await db.commit()

    return None




