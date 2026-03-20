import asyncio
from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import select

async def run():
    async with db_manager.session() as s:
        res = await s.execute(select(User).where(User.email=="bhargavatejgolla@gmail.com"))
        user = res.scalar_one_or_none()
        if user:
            print("Found User:", user.email, "Current Role:", getattr(user, 'role', 'NO_ROLE_ATTR'))
            if hasattr(user, 'role'):
                user.role = 'admin'
                await s.commit()
                print("Successfully updated role to admin in the database.")
        else:
            print("User not found.")

if __name__ == "__main__":
    asyncio.run(run())
