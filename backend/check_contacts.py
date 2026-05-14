import os
import sys
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.append(os.getcwd())

db_url = "postgresql://postgres:postgres@127.0.0.1:5433/laminar"

engine = sa.create_engine(db_url)
Session = sessionmaker(bind=engine)
session = Session()

try:
    # Use reflection to see what's in alert_contacts if model is hard to import
    from app.models.alert_contact import AlertContact
    contacts = session.query(AlertContact).all()
    print("Alert Contacts in Database:")
    for c in contacts:
        print(f"- {c.name} ({c.email}, {c.phone}) - Active: {getattr(c, 'is_active', 'N/A')}")
except Exception as e:
    print(f"Error: {e}")
finally:
    session.close()
