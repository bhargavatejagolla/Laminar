import pytest
import asyncio
from httpx import AsyncClient
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import db_manager
from app.models.user import User, UserRole
from app.core.security import hash_password, create_access_token
from app.models.alert_contact import AlertContact

@pytest.fixture
async def async_client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def test_user():
    # Setup test user
    async with db_manager.session() as session:
        user = User(
            email="test@laminar.ai",
            password_hash=hash_password("password123"),
            role=UserRole.VIEWER,
            is_verified=True
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

@pytest.mark.asyncio
async def test_get_profile(async_client, test_user):
    token = create_access_token(user_id=test_user.id, role=test_user.role.value)
    
    response = await async_client.get(
        "/api/v1/users/profile",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@laminar.ai"
    assert data["receive_sms_alerts"] is False

@pytest.mark.asyncio
async def test_update_profile_valid_phone(async_client, test_user):
    token = create_access_token(user_id=test_user.id, role=test_user.role.value)
    
    payload = {
        "name": "Test User",
        "phone_number": "+919876543210",
        "receive_sms_alerts": True
    }
    
    response = await async_client.put(
        "/api/v1/users/profile/update",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test User"
    assert data["phone_number"] == "+919876543210"
    assert data["receive_sms_alerts"] is True
    
    # Verify AlertContact sync
    async with db_manager.session() as session:
        stmt = select(AlertContact).where(AlertContact.user_id == test_user.id)
        result = await session.execute(stmt)
        contact = result.scalar_one()
        assert contact.phone_number == "+919876543210"
        assert contact.receive_sms is True

@pytest.mark.asyncio
async def test_update_profile_invalid_phone(async_client, test_user):
    token = create_access_token(user_id=test_user.id, role=test_user.role.value)
    
    payload = {
        "phone_number": "12345", # Invalid Indian phone
    }
    
    response = await async_client.put(
        "/api/v1/users/profile/update",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    assert response.status_code == 422 # Validation Error
