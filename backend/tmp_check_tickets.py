import asyncio, sys
sys.path.insert(0, '.')

async def test():
    from app.core.database import db_manager
    await db_manager.initialize()
    from app.core.security import decode_token
    from app.models.user import User
    from sqlalchemy import select
    from uuid import UUID

    # Get a token from the DB - pick the first user's email
    async with db_manager.session() as s:
        r = await s.execute(select(User).limit(3))
        users = r.scalars().all()
        for u in users:
            print(f"User: {u.email} | role={u.role} | active={u.is_active} | id={u.id}")

asyncio.run(test())
