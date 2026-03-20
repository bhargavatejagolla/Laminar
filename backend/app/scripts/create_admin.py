"""
Laminar - Super Admin Bootstrap Script
--------------------------------------

Creates first admin user safely.
Run once during system initialization.
"""

import asyncio
import getpass

from sqlalchemy import select

from app.core.database import db_manager
from app.core.security import hash_password
from app.models.user import User, UserRole


async def create_admin():

    await db_manager.initialize()

    email = input("Enter admin email: ").strip()
    password = getpass.getpass("Enter admin password: ")

    async with db_manager.session() as session:

        # Check if admin already exists
        stmt = select(User).where(User.role == UserRole.ADMIN)
        result = await session.execute(stmt)
        existing_admin = result.scalar_one_or_none()

        if existing_admin:
            print("⚠️ Admin already exists.")
            return

        # Create admin user
        admin = User(
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            is_verified=True,
        )

        session.add(admin)
        await session.commit()

        print("✅ Admin user created successfully.")


if __name__ == "__main__":
    asyncio.run(create_admin())
