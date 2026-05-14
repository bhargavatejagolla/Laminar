import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.core.database import db_manager
from app.models.user import User
from app.core.config import settings
from sqlalchemy import select

async def check_static_emails():
    static_emails = []
    static_emails.extend(settings.get_management_emails())
    static_emails.extend(settings.get_police_emails())
    static_emails.extend(settings.get_supervisor_emails())
    
    unique_emails = list(set(static_emails))
    print(f"Checking {len(unique_emails)} static emails from .env...")
    
    async with db_manager.session() as session:
        stmt = select(User).where(User.email.in_(unique_emails))
        result = await session.execute(stmt)
        db_users = result.scalars().all()
        
        db_emails = {u.email: u.is_active for u in db_users}
        
        for email in unique_emails:
            if email in db_emails:
                status = "Active" if db_emails[email] else "DEACTIVATED"
                print(f"- {email}: Found in DB, status: {status}")
            else:
                print(f"- {email}: NOT FOUND in DB (Removed?)")

if __name__ == "__main__":
    asyncio.run(check_static_emails())
