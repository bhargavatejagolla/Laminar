import asyncio
import httpx

async def diag_profile():
    # We might need a token, but let's see if we can trigger the 500
    # Actually without auth it will be 401. 
    # Let's try to simulate the internal fetch logic.
    from app.core.database import db_manager
    from app.models.user import User
    from sqlalchemy import select
    
    async with db_manager.session() as session:
        result = await session.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        if not user:
            print("No users found to test profile diagnostics.")
            return
            
        print(f"Testing profile for user: {user.email}")
        try:
            # Emulate the serialization logic in endpoints/users.py
            role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
            print(f"Role: {role_val}")
            
            from app.schemas.users import UserProfileResponse
            resp = UserProfileResponse(
                id=user.id,
                email=user.email,
                role=role_val,
                is_active=user.is_active,
                name=user.name,
                phone_number=user.phone_number,
                profile_picture=user.profile_picture,
                receive_sms_alerts=user.receive_sms_alerts,
                alert_email=user.alert_email,
                receive_email_alerts=user.receive_email_alerts,
                language_preference=user.language_preference,
            )
            print("Successfully serialized profile.")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"FAILED to serialize: {e}")

if __name__ == "__main__":
    asyncio.run(diag_profile())
