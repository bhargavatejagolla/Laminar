import asyncio
from uuid import UUID
from app.core.database import db_manager
from sqlalchemy import select
from app.models.user import User
from app.schemas.users import UserProfileResponse

async def test():
    await db_manager.initialize()
    async with db_manager.session() as session:
        stmt = select(User).where(User.email == "bhargavatejgolla@gmail.com")
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            # simulate the role escalation in get_current_user
            user.role = "super_admin"
            await session.commit()

    if user:
        print(f"User found: {user.email}")
        try:
            resp = UserProfileResponse.model_validate(user)
            print("Serialization successful!")
            print(resp.model_dump())
        except Exception as e:
            print("Serialization failed!")
            import traceback
            traceback.print_exc()
    else:
        print("User not found.")

asyncio.run(test())
