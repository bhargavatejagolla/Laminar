import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import select

async def check_inactive_users():
    async with db_manager.session() as session:
        stmt = select(User).where(User.is_active == False)
        result = await session.execute(stmt)
        users = result.scalars().all()
        if not users:
            print("No inactive users found.")
        for u in users:
            print(f"Inactive User: {u.email} (ID: {u.id})")

if __name__ == "__main__":
    asyncio.run(check_inactive_users())
