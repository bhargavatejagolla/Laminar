
import asyncio
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.users import UserProfileResponse
from app.models.user import UserRole

async def test_profile_response():
    print("Testing UserProfileResponse validation...")
    try:
        # Mocking what users.py does
        user_id = uuid4()
        user_role = "super_admin"
        
        resp = UserProfileResponse(
            id=user_id,
            email="test@example.com",
            role=user_role,
            is_active=True,
            name="Test User",
            phone_number="+919876543210",
            profile_picture=None,
            receive_sms_alerts=False,
            alert_email=None,
            receive_email_alerts=True,
            language_preference="en"
        )
        print("Success: ", resp.model_dump())
    except ValidationError as e:
        print("Validation Error: ", e)
    except Exception as e:
        print("Unexpected Error: ", e)

if __name__ == "__main__":
    asyncio.run(test_profile_response())
