import sqlite3
import os

db_path = "laminar.db"

if os.path.exists(db_path):
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables found: {[t[0] for t in tables]}")
    
    target_table = "cameras"
    if target_table in [t[0] for t in tables]:
        print(f"Adding last_snapshot column to {target_table}...")
        try:
            cursor.execute(f"ALTER TABLE {target_table} ADD COLUMN last_snapshot JSON")
            conn.commit()
            print("Success: Column last_snapshot added.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column already exists. Skipping.")
            else:
                print(f"Error: {e}")
    else:
        print(f"Error: Table {target_table} not found in {db_path}.")
    
    conn.close()
else:
    print(f"Database {db_path} not found.")
