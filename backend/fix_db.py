import asyncio
from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import update

async def fix():
    async with db_manager.session() as s:
        await s.execute(
            update(User)
            .where(User.email == 'bhargavatejgolla@gmail.com')
            .values(email='bhargavatejagolla@gmail.com')
        )
        await s.commit()
    print("Fixed!")

asyncio.run(fix())
