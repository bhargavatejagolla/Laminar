import asyncio
from app.services.sms_alert_service import SmsAlertService
import logging
import sys
from dotenv import load_dotenv

# Load .env variables so SMS_GATEWAY_URL is captured
load_dotenv()

# Configure logging to see the output
logging.basicConfig(level=logging.INFO, stream=sys.stdout)

async def test_sms():
    print("Testing SMS Alert Service")
    service = SmsAlertService()
    
    # Normally this connects to a local SMS Gateway on an Android phone.
    # If the gateway is not running, the httpx call will cleanly fail,
    # log a simulation, and exit gracefully without crashing the app.
    
    test_numbers = ["+918919349090"]
    test_message = "🚨 CRITICAL CROWD ALERT: Mock testing the Local SMS Gateway 🚨"
    
    print(f"Attempting to dispatch to {len(test_numbers)} contacts")
    await service.notify_recipients(test_numbers, test_message)
    print("Test finished - check logs above for gateway connection attempts.")

if __name__ == "__main__":
    asyncio.run(test_sms())
