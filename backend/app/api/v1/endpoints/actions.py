from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from app.models.action_rule import ActionRule, ActionType
from app.core.database import db_manager

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ActionRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: str
    trigger_conditions: Optional[Dict[str, Any]] = None
    action_type: str
    action_target: str
    action_payload_template: Optional[Dict[str, Any]] = None
    is_dry_run: Optional[bool] = False
    priority_level: Optional[str] = "low"


class ActionRuleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    trigger_type: str
    action_type: str
    action_target: str
    is_active: bool
    is_dry_run: Optional[bool] = False
    priority_level: Optional[str] = "low"
    history_logs: Optional[List[Dict[str, Any]]] = []

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ActionRuleResponse])
async def get_rules():
    async with db_manager.session() as db:
        result = await db.execute(select(ActionRule))
        rules = result.scalars().all()
    return rules


@router.post("", response_model=ActionRuleResponse)
async def create_rule(rule_in: ActionRuleCreate):
    async with db_manager.session() as db:
        # Map string action_type to proper Enum value
        try:
            action_type_enum = ActionType(rule_in.action_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action_type '{rule_in.action_type}'. Must be one of: {[e.value for e in ActionType]}"
            )

        db_rule = ActionRule(
            name=rule_in.name,
            description=rule_in.description,
            trigger_type=rule_in.trigger_type,
            trigger_conditions=rule_in.trigger_conditions,
            action_type=action_type_enum,
            action_target=rule_in.action_target,
            action_payload_template=rule_in.action_payload_template,
            is_dry_run=rule_in.is_dry_run,
            priority_level=rule_in.priority_level or "low"
        )
        db.add(db_rule)
        await db.commit()
        await db.refresh(db_rule)
    return db_rule


@router.delete("/{rule_id}")
async def delete_rule(rule_id: UUID):
    async with db_manager.session() as db:
        result = await db.execute(select(ActionRule).where(ActionRule.id == rule_id))
        db_rule = result.scalar_one_or_none()
        if not db_rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        await db.delete(db_rule)
        await db.commit()
    return {"ok": True}
