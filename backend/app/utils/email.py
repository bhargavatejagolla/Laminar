"""
Laminar - Email Utilities
-------------------------
Handles sending transactional emails like OTP verification.
"""

import logging
from email.message import EmailMessage
import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_verification_email(to_email: str, otp: str):
    """
    Sends a 6-digit OTP to the user's email asynchronously.
    Falls back to console print if SMTP config is missing/invalid.
    """
    # Always print for development visibility
    print(f"\n==============================================")
    print(f"DEBUG: Email Intercepted!")
    print(f"To: {to_email}")
    print(f"Subject: Verify your Laminar Account")
    print(f"OTP: {otp}")
    print(f"==============================================\n")

    # Use dedicated Auth SMTP if configured, otherwise fallback to main SMTP
    host = settings.AUTH_SMTP_HOST or settings.SMTP_HOST
    port = settings.AUTH_SMTP_PORT or settings.SMTP_PORT
    user = settings.AUTH_SMTP_USER or settings.SMTP_USER
    password = settings.AUTH_SMTP_PASSWORD or settings.SMTP_PASSWORD

    if not host or not user or not password:
        logger.warning(f"SMTP not fully configured. OTP '{otp}' generated for {to_email} but real email not sent.")
        return

    message = EmailMessage()
    message["From"] = user
    message["To"] = to_email
    message["Subject"] = "Verify your Laminar Account Dashboard Code"
    
    body = f"""Hello,

Welcome to Laminar! 

Here is your 6-digit verification code: {otp}

Enter this code on the verification page to initialize your profile.

Regards,
Laminar Security Operations
"""
    message.set_content(body)

    try:
        # Determine TLS strategy
        # Port 465 is typically direct SSL/TLS
        # Port 587 is typically plain + STARTTLS
        is_port_465 = int(port) == 465
        
        await aiosmtplib.send(
            message,
            hostname=host,
            port=port,
            username=user,
            password=password,
            use_tls=is_port_465,
            start_tls=not is_port_465,
            timeout=10
        )
        logger.info(f"OTP sent successfully to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        # Proceed silently in production to avoid crashing registration due to SMTP hiccups
