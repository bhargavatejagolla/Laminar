from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.database import db_manager
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.ticket import Ticket, TicketMessage, TicketStatus
from app.schemas.ticket import (
    TicketCreate,
    TicketResponse,
    TicketDetailResponse,
    TicketMessageCreate,
    TicketMessageResponse,
    TicketStatusUpdate
)

router = APIRouter()


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    ticket_in: TicketCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new support ticket."""
    async with db_manager.session() as session:
        new_ticket = Ticket(
            title=ticket_in.title,
            description=ticket_in.description,
            creator_id=current_user.id,
        )
        session.add(new_ticket)
        await session.commit()
        await session.refresh(new_ticket)

        result = TicketResponse(
            id=new_ticket.id,
            title=new_ticket.title,
            description=new_ticket.description,
            status=new_ticket.status,
            creator_id=new_ticket.creator_id,
            created_at=new_ticket.created_at,
            updated_at=new_ticket.updated_at,
            creator_email=current_user.email,
        )
        return result


@router.get("", response_model=List[TicketResponse])
async def get_tickets(
    current_user: User = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
):
    """
    List tickets.
    Viewers see only their own tickets.
    Admins and Super Admins see all tickets.
    """
    async with db_manager.session() as session:
        # Join with User to get creator email in one query
        stmt = (
            select(Ticket, User.email)
            .outerjoin(User, Ticket.creator_id == User.id)
            .order_by(Ticket.created_at.desc())
        )

        if current_user.role == UserRole.USER:
            stmt = stmt.where(Ticket.creator_id == current_user.id)

        stmt = stmt.offset(offset).limit(limit)
        result = await session.execute(stmt)
        rows = result.all()

        tickets_out = []
        for ticket, creator_email in rows:
            tickets_out.append(TicketResponse(
                id=ticket.id,
                title=ticket.title,
                description=ticket.description,
                status=ticket.status,
                creator_id=ticket.creator_id,
                created_at=ticket.created_at,
                updated_at=ticket.updated_at,
                creator_email=creator_email,
            ))

        return tickets_out


@router.get("/{ticket_id}", response_model=TicketDetailResponse)
async def get_ticket(
    ticket_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Get a specific ticket by ID with all messages."""
    async with db_manager.session() as session:
        result = await session.execute(select(Ticket).where(Ticket.id == ticket_id))
        ticket = result.scalar_one_or_none()

        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if current_user.role == UserRole.USER and ticket.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this ticket")

        creator_result = await session.execute(select(User).where(User.id == ticket.creator_id))
        creator = creator_result.scalar_one_or_none()

        msgs_result = await session.execute(
            select(TicketMessage)
            .where(TicketMessage.ticket_id == ticket_id)
            .order_by(TicketMessage.created_at)
        )
        msgs = msgs_result.scalars().all()

        msgs_out = []
        for msg in msgs:
            sender_result = await session.execute(select(User).where(User.id == msg.sender_id))
            sender = sender_result.scalar_one_or_none()
            msgs_out.append(TicketMessageResponse(
                id=msg.id,
                ticket_id=msg.ticket_id,
                sender_id=msg.sender_id,
                message=msg.message,
                created_at=msg.created_at,
                sender_email=sender.email if sender else None,
                sender_role=str(sender.role.value) if sender else None,
            ))

        return TicketDetailResponse(
            id=ticket.id,
            title=ticket.title,
            description=ticket.description,
            status=ticket.status,
            creator_id=ticket.creator_id,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            creator_email=creator.email if creator else None,
            messages=msgs_out,
        )


@router.post("/{ticket_id}/messages", response_model=TicketMessageResponse, status_code=status.HTTP_201_CREATED)
async def add_ticket_message(
    ticket_id: UUID,
    message_in: TicketMessageCreate,
    current_user: User = Depends(get_current_user),
):
    """Reply to a ticket."""
    async with db_manager.session() as session:
        result = await session.execute(select(Ticket).where(Ticket.id == ticket_id))
        ticket = result.scalar_one_or_none()

        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if current_user.role == UserRole.USER and ticket.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to reply to this ticket")

        new_msg = TicketMessage(
            ticket_id=ticket.id,
            sender_id=current_user.id,
            message=message_in.message,
        )
        session.add(new_msg)

        # Reopen ticket if it was closed
        if ticket.status == TicketStatus.CLOSED:
            ticket.status = TicketStatus.OPEN

        await session.commit()
        await session.refresh(new_msg)

        return TicketMessageResponse(
            id=new_msg.id,
            ticket_id=new_msg.ticket_id,
            sender_id=new_msg.sender_id,
            message=new_msg.message,
            created_at=new_msg.created_at,
            sender_email=current_user.email,
            sender_role=str(current_user.role.value),
        )


@router.patch("/{ticket_id}/status", response_model=TicketResponse)
async def update_ticket_status(
    ticket_id: UUID,
    status_in: TicketStatusUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update ticket status. Admins can change freely; Viewers can only close their own."""
    async with db_manager.session() as session:
        result = await session.execute(select(Ticket).where(Ticket.id == ticket_id))
        ticket = result.scalar_one_or_none()

        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if current_user.role == UserRole.USER:
            if ticket.creator_id != current_user.id:
                raise HTTPException(status_code=403, detail="Not authorized")
            if status_in.status != TicketStatus.CLOSED:
                raise HTTPException(status_code=403, detail="Viewers can only close their own tickets")

        ticket.status = status_in.status
        await session.commit()
        await session.refresh(ticket)

        creator_result = await session.execute(select(User).where(User.id == ticket.creator_id))
        creator = creator_result.scalar_one_or_none()

        return TicketResponse(
            id=ticket.id,
            title=ticket.title,
            description=ticket.description,
            status=ticket.status,
            creator_id=ticket.creator_id,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            creator_email=creator.email if creator else None,
        )
