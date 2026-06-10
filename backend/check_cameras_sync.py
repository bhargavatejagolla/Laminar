from sqlalchemy import create_engine, text

url = "postgresql://postgres:postgres@127.0.0.1:5433/laminar"
engine = create_engine(url)

with engine.connect() as conn:
    res = conn.execute(text('SELECT id, name, camera_type, venue_id FROM cameras'))
    cameras = [dict(r._mapping) for r in res]
    for c in cameras:
        print(c)
