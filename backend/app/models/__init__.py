"""
Laminar - Models Package
-----------------------

SQLAlchemy ORM models for the Laminar system.

All models must be imported here so SQLAlchemy can register them
in the metadata. This is critical for:

- Alembic autogeneration
- Relationship resolution
- Proper mapper configuration
"""

# ==========================================================
# Core Models (Import Order Matters)
# ==========================================================

from app.models.venue import Venue
from app.models.user import User
from app.models.user_venue_access import UserVenueAccess
from app.models.camera import Camera

from app.models.detection import Detection

from app.models.crowd_alert import CrowdAlert
from app.models.crowd_frame import CrowdFrame
from .venue_event import VenueEvent
from app.models.evidence_clip import EvidenceClip
from app.models.queue_estimate import QueueEstimate
from .alert import Alert
from .alert_contact import AlertContact
from .action_rule import ActionRule
from app.models.dwell_monitor import MonitoringZone, PersonDwellTime
from app.models.journey import Journey

from app.models.ticket import Ticket, TicketMessage

# ==========================================================
# Public Exports
# ==========================================================

__all__ = [
    "Alert",
    "AlertContact",
    "ActionRule",
    "Camera",
    "Detection",
    "CrowdAlert",
    "CrowdFrame",
    "EvidenceClip",
    "QueueEstimate",
    "AlertContact",
    "Journey",
    "Ticket",
    "TicketMessage",
]


# ==========================================================
# Debug Logging (Optional)
# ==========================================================

import logging

logger = logging.getLogger(__name__)
logger.debug("All SQLAlchemy models loaded and registered successfully.")
