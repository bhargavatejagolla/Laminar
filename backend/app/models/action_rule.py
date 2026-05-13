from sqlalchemy import Column, String, Boolean, JSON, Enum
from app.models.base import BaseModel
import enum

class ActionType(str, enum.Enum):
    WEBHOOK = "webhook"
    EMAIL = "email"
    SMS = "sms"
    IOT_COMMAND = "iot_command"

class ActionRule(BaseModel):
    """
    IFTTT (If This Then That) rule for automated agentic actions.
    Extends BaseModel which provides: UUID primary key, timestamps,
    soft-delete, tenant isolation, audit trail.
    """
    __tablename__ = "action_rules"

    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_dry_run = Column(Boolean, default=False)
    priority_level = Column(String(20), default="low") # low, medium, critical

    # Trigger conditions
    trigger_type = Column(String(50), nullable=False)        # e.g., "alert_created", "critical_surge"
    trigger_conditions = Column(JSON, nullable=True)          # e.g., {"risk_level": "critical"}

    # Action details
    action_type = Column(Enum(ActionType), nullable=False)
    action_target = Column(String(500), nullable=False)       # webhook URL, email, IoT topic, etc.
    action_payload_template = Column(JSON, nullable=True)     # JSON template to POST
    
    # Audit & Tracking
    history_logs = Column(JSON, default=list) # List of last 5 runs: [{"id", "ts", "status", "details"}]
