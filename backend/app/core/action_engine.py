import asyncio
import httpx
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy import select
from app.models.action_rule import ActionRule, ActionType
from app.core.logging import get_logger
import os

logger = get_logger(__name__)

class ActionEngine:
    """
    Evaluates system events (like alerts) against defined ActionRules
    and executes the corresponding actions (Webhooks, IoT commands, etc.) asynchronously.
    Uses the project-standard async db_manager instead of a sync Session.
    """
    def __init__(self):
        self._http_client = httpx.AsyncClient(timeout=5.0)

    async def close(self):
        await self._http_client.aclose()

    async def process_event(self, event_type: str, event_data: Dict[str, Any]):
        """Main entry point. Dispatches event to matching rules."""
        # Execute in background to avoid blocking the main vision/loop
        task = asyncio.create_task(self._evaluate_and_execute(event_type, event_data))
        return task

    async def _evaluate_and_execute(self, event_type: str, event_data: Dict[str, Any]):
        try:
            logger.info(f"ActionEngine received event: {event_type}")
            from app.core.database import db_manager
            async with db_manager.session() as db:
                result = await db.execute(
                    select(ActionRule).where(
                        ActionRule.trigger_type == event_type
                    )
                )
                all_rules = result.scalars().all()
                # filter in-memory to handle potential NULLs in older DBs
                rules: List[ActionRule] = [r for r in all_rules if r.is_active is not False]

            if not rules:
                logger.debug(f"No active rules found for trigger: {event_type}")
                return

            logger.info(f"Found {len(rules)} potential rules for {event_type}")

            for rule in rules:
                try:
                    if self._evaluate_condition(rule.trigger_conditions, event_data):
                        logger.info(f"Executing action rule: {rule.name} ({rule.action_type})")
                        await self._execute_action(rule, event_data)
                    else:
                        logger.debug(f"Conditions not met for rule: {rule.name}")
                except Exception as e:
                    import traceback
                    error_msg = f"Error executing rule '{rule.name}': {str(e)}\n{traceback.format_exc()}"
                    logger.error(error_msg)
                    # Write to a dedicated debug file for the user to see easily
                    os.makedirs("logs", exist_ok=True)
                    with open("logs/action_errors.log", "a") as f:
                        f.write(f"[{datetime.now()}] {error_msg}\n")

        except Exception as e:
            import traceback
            logger.error(f"Failed to process automated actions for {event_type}: {e}\n{traceback.format_exc()}")

    def _evaluate_condition(self, conditions: Optional[Dict[str, Any]], event_data: Dict[str, Any]) -> bool:
        """Evaluates simple key-value match conditions. Empty conditions always match."""
        if not conditions or not isinstance(conditions, dict):
            return True
        for key, expected_value in conditions.items():
            if event_data.get(key) != expected_value:
                return False
        return True

    async def _execute_action(self, rule: ActionRule, event_data: Dict[str, Any]):
        """Executes the specific action defined in the rule."""
        execution_status = "success"
        error_detail = None
        
        try:
            # Check for Dry Run early
            is_dry = bool(getattr(rule, 'is_dry_run', False))
            
            # Use data directly if no template, else merge/replace
            payload = dict(rule.action_payload_template) if rule.action_payload_template else {}
            
            # Simple variable replacement in payload if templated
            if payload:
                for k, v in list(payload.items()):
                    if isinstance(v, str) and "{" in v and "}" in v:
                        for key, val in event_data.items():
                            v = v.replace(f"{{{key}}}", str(val))
                        payload[k] = v
            else:
                payload = event_data # Fallback to sending event data

            if is_dry:
                logger.info(f"[DRY RUN] Simulation of {rule.action_type} for rule: {rule.name}")
                execution_status = "dry_run"
            elif rule.action_type == ActionType.WEBHOOK:
                logger.info(f"Sending Webhook to {rule.action_target}")
                response = await self._http_client.post(rule.action_target, json=payload)
                logger.info(f"Webhook '{rule.name}' completed with status {response.status_code}")
                if response.status_code >= 400:
                    execution_status = "failed"
                    error_detail = f"HTTP {response.status_code}"

            elif rule.action_type == ActionType.EMAIL:
                from app.services.notification_service import NotificationService
                from email.message import EmailMessage
                
                service = NotificationService()
                msg = EmailMessage()
                msg["From"] = os.getenv("SMTP_USER", "alerts@laminar.ai")
                msg["Subject"] = f"[LAMINAR AUTO] {rule.name}"
                
                details = "\n".join([f"{k}: {v}" for k, v in event_data.items() if k != "id"])
                body = f"Automated action '{rule.name}' triggered by Laminar.\n\nTrigger Event: {rule.trigger_type}\n\nMetrics:\n{details}"
                msg.set_content(body)
                
                recipients = [r.strip() for r in rule.action_target.split(",")]
                logger.debug(f"Sending automated email to {recipients}")
                await service._send_email(msg, recipients)

            elif rule.action_type == ActionType.SMS:
                from app.services.sms_alert_service import SmsAlertService
                sms_service = SmsAlertService()
                
                msg_text = f"Laminar Alert: {rule.name} triggered. Risk: {event_data.get('risk_level', 'Unknown')}"
                recipients = [r.strip() for r in rule.action_target.split(",")]
                
                await sms_service.notify_recipients(recipients, msg_text)

            elif rule.action_type == ActionType.IOT_COMMAND:
                logger.info(f"IoT Command simulation: topic={rule.action_target}, payload={payload}")

        except Exception as e:
            execution_status = "failed"
            error_detail = str(e)
            logger.error(f"Action execution failed: {e}")
        
        # PERSISTENT HISTORY LOGGING
        try:
            from app.core.database import db_manager
            async with db_manager.session() as db:
                # Re-fetch or merge to ensure we can update
                # In this specific architecture, we access the DB directly
                new_log = {
                    "id": event_data.get("id", "evt_" + datetime.now().strftime("%Y%m%d%H%M%S")),
                    "timestamp": datetime.now().isoformat(),
                    "status": execution_status,
                    "details": error_detail or ("Simulated execution" if execution_status == "dry_run" else "Execution complete")
                }
                
                # Update rule history (keep last 10 for better visibility in Mission Control)
                current_history = list(rule.history_logs or [])
                current_history.insert(0, new_log)
                rule.history_logs = current_history[:10]
                
                from sqlalchemy import update
                await db.execute(
                    update(ActionRule)
                    .where(ActionRule.id == rule.id)
                    .values(history_logs=rule.history_logs)
                )
                await db.commit()
                logger.info(f"Updated history for rule: {rule.name}")
        except Exception as log_err:
            logger.error(f"Failed to update action history: {log_err}")

        if execution_status == "failed" and error_detail:
            raise Exception(error_detail)

# Singleton instance
action_engine = ActionEngine()

