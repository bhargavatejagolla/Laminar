
import asyncio
import os
import sys

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import select
from app.core.security import verify_password, create_access_token

async def test_login():
    try:
        print("Initializing database...")
        await db_manager.initialize()
        print("Database initialized.")
        
        async with db_manager.session() as session:
            print("Querying user...")
            # We don't know a valid email, so we just try to query ANY user
            stmt = select(User).limit(1)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user:
                print("No users found in database.")
                return
            
            print(f"Found user: {user.email}")
            print(f"User role: {user.role}")
            
            # Test token creation
            print("Testing token creation...")
            token = create_access_token(user_id=user.id, role=user.role.value)
            print("Token created successfully.")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILED: {e}")
    finally:
        await db_manager.close()

if __name__ == "__main__":
    asyncio.run(test_login())
