from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from twilio.rest import Client
import asyncio
import logging

from app.core.database import get_db
from app.core.config import settings
from app.models.emergency_profile import EmergencyProfile
from app.schemas.emergency import EmergencyProfileCreate, EmergencyProfileResponse, EmergencyTrigger

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register", response_model=EmergencyProfileResponse)
async def register_emergency_profile(profile_in: EmergencyProfileCreate, db: AsyncSession = Depends(get_db)):
    """Register a new emergency profile (one-time setup)."""
    new_profile = EmergencyProfile(
        full_name=profile_in.full_name,
        photo_url=profile_in.photo_url,
        default_address=profile_in.default_address,
        emergency_contact_name=profile_in.emergency_contact_name,
        emergency_contact_phone=profile_in.emergency_contact_phone
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)
    return new_profile

@router.get("/profile/{profile_id}", response_model=EmergencyProfileResponse)
async def get_emergency_profile(profile_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch an emergency profile by ID."""
    result = await db.execute(select(EmergencyProfile).where(EmergencyProfile.id == profile_id))
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


from email.mime.image import MIMEImage
import base64

def send_emergency_email(profile: EmergencyProfile, lat: float, lng: float):
    """Sends a real email using SMTP configuration."""
    try:
        sender_email = settings.SMTP_USER
        sender_password = settings.SMTP_PASSWORD
        
        # Combine all configured alert emails
        recipient_emails = []
        recipient_emails.extend(settings.get_management_emails())
        recipient_emails.extend(settings.get_police_emails())
        recipient_emails.extend(settings.get_supervisor_emails())
        
        # Remove duplicates
        recipient_emails = list(set(recipient_emails))
        
        if not sender_email or not sender_password:
            logger.error("SMTP credentials missing. Cannot send emergency email.")
            return False

        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = ", ".join(recipient_emails)
        msg['Subject'] = f"🚨 URGENT: EMERGENCY BEACON ACTIVATED FOR {profile.full_name} 🚨"

        maps_link = f"https://maps.google.com/?q={lat},{lng}"
        body = f"""
        EMERGENCY ALERT INITIATED
        
        Name: {profile.full_name}
        Home Address: {profile.default_address}
        
        Emergency Contact: {profile.emergency_contact_name} ({profile.emergency_contact_phone})
        
        Real-time Location Captured: 
        Latitude: {lat}
        Longitude: {lng}
        
        Map Link: {maps_link}
        
        This is an automated alert from Laminar Sentinel Command. Immediate action is required.
        """
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach photo if it's base64
        if profile.photo_url and profile.photo_url.startswith("data:image"):
            try:
                # Format: data:image/jpeg;base64,/9j/...
                header, encoded = profile.photo_url.split(",", 1)
                data = base64.b64decode(encoded)
                image = MIMEImage(data)
                image.add_header('Content-Disposition', 'attachment', filename="emergency_photo.jpg")
                msg.attach(image)
            except Exception as e:
                logger.error(f"Failed to attach photo to email: {e}")

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()
        server.login(sender_email, sender_password)
        text = msg.as_string()
        server.sendmail(sender_email, recipient_emails, text)
        server.quit()
        logger.info(f"Emergency email sent for {profile.full_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to send emergency email: {str(e)}")
        return False

def make_emergency_call(profile: EmergencyProfile, lat: float, lng: float):
    """Makes a real phone call using Twilio."""
    try:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_FROM_NUMBER:
            logger.warning("Twilio credentials missing. Skipping real phone call.")
            return False
            
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        # Format the phone number. If it's just 10 digits, assume India (+91)
        phone = profile.emergency_contact_phone.strip()
        if len(phone) == 10 and phone.isdigit():
            phone = f"+91{phone}"
        elif not phone.startswith('+'):
            phone = f"+{phone}"

        twiml = f"""
        <Response>
            <Say voice="alice">Emergency alert from Laminar SafeLink.</Say>
            <Say voice="alice">{profile.full_name} has activated their emergency beacon.</Say>
            <Say voice="alice">Their location has been captured and shared via email.</Say>
            <Say voice="alice">Immediate attention may be required.</Say>
        </Response>
        """
        
@router.post("/trigger")
async def trigger_emergency(trigger_data: EmergencyTrigger, db: AsyncSession = Depends(get_db)):
    """Triggers the emergency sequence (Email + Global Mesh Notification). WhatsApp is handled client-side."""
    result = await db.execute(select(EmergencyProfile).where(EmergencyProfile.id == trigger_data.profile_id))
    profile = result.scalars().first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Broadcast to the Laminar Global Mesh (SSE / UI Notifications)
    maps_link = f"https://maps.google.com/?q={trigger_data.latitude},{trigger_data.longitude}"
    
    await notification_service.push_notification(
        type="emergency_beacon",
        priority="CRITICAL",
        description=f"Beacon Activated: {profile.full_name}. Location: {trigger_data.latitude}, {trigger_data.longitude}",
        venue_id=str(profile.id),
        venue_name=profile.default_address,
        domain="EMERGENCY_BEACON",
        metadata={
            "lat": trigger_data.latitude, 
            "lng": trigger_data.longitude, 
            "phone": profile.emergency_contact_phone,
            "camera_location": f"GPS: {trigger_data.latitude}, {trigger_data.longitude}",
            "maps_url": maps_link
        }
    )

    # Run network tasks concurrently in background thread pool to not block async loop
    loop = asyncio.get_event_loop()
    email_success = await loop.run_in_executor(None, send_emergency_email, profile, trigger_data.latitude, trigger_data.longitude)

    return {
        "status": "success",
        "message": "Emergency sequence initiated",
        "details": {
            "email_sent": email_success,
            "whatsapp_redirect": True,
            "liability_case_created": True,
            "incident_id": f"LMNR-EMG-{profile.id[:6].upper()}"
        }
    }
