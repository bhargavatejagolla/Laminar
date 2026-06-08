import asyncio
from app.core.database import async_session_factory, db_manager
from app.services.ai_assistant_service import AIAssistantService

async def rebuild_index():
    await db_manager.initialize()
    async with await async_session_factory() as session:
        svc = AIAssistantService()
        print("Starting RAG index extraction...")
        await svc.extract_and_index(session)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(rebuild_index())
