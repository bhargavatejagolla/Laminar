from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.models.ticket import TicketStatus


class TicketMessageBase(BaseModel):
    message: str

class TicketMessageCreate(TicketMessageBase):
    pass

class TicketMessageResponse(TicketMessageBase):
    id: UUID
    ticket_id: UUID
    sender_id: UUID
    created_at: datetime
    
    sender_email: Optional[str] = None
    sender_role: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketBase(BaseModel):
    title: str
    description: str

class TicketCreate(TicketBase):
    pass

class TicketStatusUpdate(BaseModel):
    status: TicketStatus

class TicketResponse(TicketBase):
    id: UUID
    status: TicketStatus
    creator_id: UUID
    created_at: datetime
    updated_at: datetime
    
    creator_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketDetailResponse(TicketResponse):
    messages: List[TicketMessageResponse] = []
