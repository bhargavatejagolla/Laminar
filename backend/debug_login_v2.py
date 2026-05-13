
import asyncio
import os
import sys
from datetime import datetime, timezone

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from app.core.database import db_manager
from app.models.user import User
from sqlalchemy import select
from app.core.security import create_access_token

async def test_full_login_logic():
    try:
        print("Initializing database...")
        await db_manager.initialize()
        
        async with db_manager.session() as session:
            stmt = select(User).limit(1)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user:
                print("No users found.")
                return
            
            print(f"Testing state update for {user.email}...")
            user.last_login_at = datetime.now(timezone.utc)
            await session.commit()
            print("Database update successful.")
            
            print("Testing Token creation...")
            token = create_access_token(
                user_id=user.id,
                role=user.role.value
            )
            print(f"Token created: {token[:20]}...")
            
            # Check TokenResponse schema
            from app.schemas.auth import TokenResponse
            resp = TokenResponse(access_token=token)
            print(f"Schema validation successful: {resp.model_dump()}")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILED: {e}")
    finally:
        await db_manager.close()

if __name__ == "__main__":
    asyncio.run(test_full_login_logic())
