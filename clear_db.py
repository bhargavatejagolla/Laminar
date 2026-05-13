import asyncio
import os
import sys

# Add the project root to the python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.core.database import db_manager
from sqlalchemy import text

async def clear():
    async with db_manager.session() as s:
        # Clear the person_dwell_times table
        await s.execute(text('TRUNCATE TABLE person_dwell_times CASCADE;'))
        await s.commit()
        print('Database cleared successfully.')

asyncio.run(clear())
