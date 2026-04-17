import asyncio
from app.core.database import db_manager
from app.models.action_rule import ActionRule
from sqlalchemy import select

async def check_rules():
    await db_manager.initialize()
    async with db_manager.session() as db:
        result = await db.execute(select(ActionRule))
        rules = result.scalars().all()
        print(f"TOTAL RULES: {len(rules)}")
        for rule in rules:
            print(f"RULE: {rule.name} | TRIGGER: {rule.trigger_type} | TYPE: {rule.action_type} | TARGET: {rule.action_target} | CONDITIONS: {rule.trigger_conditions}")
    await db_manager.close()

if __name__ == "__main__":
    asyncio.run(check_rules())
