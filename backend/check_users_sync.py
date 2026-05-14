import os
import sys
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.append(os.getcwd())

# Hardcoded DB URL from .env if needed, but let's try to parse it
# POSTGRES_SERVER=127.0.0.1
# POSTGRES_PORT=5433
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=postgres
# POSTGRES_DB=laminar
db_url = "postgresql://postgres:postgres@127.0.0.1:5433/laminar"

engine = sa.create_engine(db_url)
Session = sessionmaker(bind=engine)
session = Session()

try:
    from app.models.user import User
    users = session.query(User).all()
    print("Users in Database:")
    for u in users:
        print(f"- {u.email} (Active: {u.is_active})")
except Exception as e:
    print(f"Error: {e}")
finally:
    session.close()
