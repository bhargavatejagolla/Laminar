"""
Finalize role column migration - clean up and finish.
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings

async def main():
    engine = create_async_engine(str(settings.DATABASE_URL))
    async with engine.begin() as conn:
        # Check current state
        r = await conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name IN ('role', 'role_new')
            ORDER BY column_name
        """))
        cols = r.fetchall()
        print("Current columns:", cols)
        
        col_names = [c[0] for c in cols]
        
        if 'role_new' in col_names and 'role' in col_names:
            # Both exist - migration was partially done, finish it
            print("Finishing partial migration...")
            await conn.execute(text("ALTER TABLE users DROP COLUMN role"))
            await conn.execute(text("ALTER TABLE users RENAME COLUMN role_new TO role"))
            await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET NOT NULL"))
            await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'"))
            print("Column renamed to role.")
        elif 'role_new' in col_names and 'role' not in col_names:
            # old role already dropped, just rename
            print("Just renaming role_new to role...")
            await conn.execute(text("ALTER TABLE users RENAME COLUMN role_new TO role"))
            await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET NOT NULL"))
            await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'"))
        elif 'role' in col_names:
            # role exists but role_new does not - check type
            r2 = await conn.execute(text("""
                SELECT data_type FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'role'
            """))
            dtype = r2.scalar()
            print("role column type:", dtype)
            if dtype != 'character varying':
                # Still enum type, redo full migration
                print("Role is still native enum, doing full migration...")
                await conn.execute(text("ALTER TABLE users ADD COLUMN role_new VARCHAR(50)"))
                await conn.execute(text("""
                    UPDATE users SET role_new = 
                        CASE 
                            WHEN LOWER(role::text) IN ('super_admin') THEN 'super_admin'
                            WHEN LOWER(role::text) IN ('admin') THEN 'admin'
                            WHEN LOWER(role::text) IN ('manager') THEN 'admin'
                            WHEN LOWER(role::text) IN ('operator','viewer') THEN 'user'
                            ELSE 'user'
                        END
                """))
                await conn.execute(text("ALTER TABLE users DROP COLUMN role"))
                await conn.execute(text("ALTER TABLE users RENAME COLUMN role_new TO role"))
                await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET NOT NULL"))
                await conn.execute(text("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'"))
            else:
                print("Role is already VARCHAR - checking values...")
                r3 = await conn.execute(text("SELECT DISTINCT role FROM users LIMIT 20"))
                print("Current distinct values:", r3.fetchall())
        
        # Drop old enum type
        try:
            await conn.execute(text("DROP TYPE IF EXISTS userrole"))
            print("Dropped userrole enum type.")
        except Exception as e:
            print("Note:", str(e))
        
        # Final check
        r4 = await conn.execute(text("SELECT id, email, role FROM users LIMIT 5"))
        print("Sample rows:", r4.fetchall())
    
    print("DONE - Migration complete!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
