"""
Laminar - AI Fallback Provider Service
---------------------------------------

Provides a robust, multi-layered AI inference engine with a strict fallback chain:
1. Google Gemini (Fastest, highest quality)
2. Groq AI (Ultra-fast Llama/Mixtral models)
3. Local Ollama (Self-hosted deepseek-coder/llama3)
4. Rule-based / None (Ultimate fallback)

This service abstracts away the underlying HTTP requests and ensures the system
remains highly available for generating intelligence briefs, explanations, and
assistant responses even if external APIs fail or rate boundaries are hit.
"""

import httpx
import asyncio
from typing import Optional
from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)

class AIFallbackProvider:
    """
    Core AI provider orchestrating the fallback logic.
    """

    def __init__(self):
        self.gemini_key = settings.GEMINI_API_KEY
        self.groq_key = settings.GROQ_API_KEY
        self.ollama_base = settings.OLLAMA_BASE_URL

        # Models to try on Groq
        self.groq_model = "llama-3.1-8b-instant"

        # Models to try on Ollama
        self.preferred_ollama_models = ["llama3.2", "llama3", "deepseek-coder:6.7b", "mistral", "phi3"]
        self._cached_ollama_model = None
        self._last_ollama_probe = 0

    async def _try_gemini(self, prompt: str, timeout: float = 15.0) -> Optional[str]:
        """Attempt to run prompt through Google Gemini API."""
        if not self.gemini_key:
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2, # Low temperature for operational analytics
                "topP": 0.8,
                "topK": 40
            }
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        content = candidates[0].get("content", {})
                        parts = content.get("parts", [])
                        if parts:
                            return parts[0].get("text", "").strip()
                logger.debug(f"Gemini failed with {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.debug(f"Gemini Exception: {e}")
        return None

    async def _try_groq(self, prompt: str, timeout: float = 15.0) -> Optional[str]:
        """Attempt to run prompt through Groq API."""
        if not self.groq_key:
            return None

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.groq_model,
            "messages": [
                {"role": "system", "content": "You are a highly capable ops assistant parsing technical data."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "").strip()
                logger.debug(f"Groq failed with {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.debug(f"Groq Exception: {e}")
        return None

    async def _get_ollama_model(self) -> Optional[str]:
        """Auto-detect available Ollama model."""
        now = asyncio.get_event_loop().time()
        if self._cached_ollama_model and (now - self._last_ollama_probe) < 120:
            return self._cached_ollama_model

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(f"{self.ollama_base}/api/tags")
                if resp.status_code == 200:
                    installed = [m["name"].split(":")[0] for m in resp.json().get("models", [])]
                    for preferred in self.preferred_ollama_models:
                        if preferred in installed:
                            self._cached_ollama_model = preferred
                            self._last_ollama_probe = now
                            return preferred
                    # if matching failed but having models
                    full_installed = [m["name"] for m in resp.json().get("models", [])]
                    for preferred in self.preferred_ollama_models:
                        for installed_mod in full_installed:
                            if installed_mod.startswith(preferred):
                                self._cached_ollama_model = installed_mod
                                self._last_ollama_probe = now
                                return installed_mod
                    if full_installed:
                        self._cached_ollama_model = full_installed[0]
                        self._last_ollama_probe = now
                        return full_installed[0]
        except Exception:
            pass
        return None

    async def _try_ollama(self, prompt: str, timeout: float = 30.0) -> Optional[str]:
        """Attempt to run prompt through local Ollama."""
        model = await self._get_ollama_model()
        if not model:
            return None

        url = f"{self.ollama_base}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 750,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return resp.json().get("response", "").strip()
                logger.debug(f"Ollama failed with {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.debug(f"Ollama Exception: {e}")
        return None

    async def generate_response(self, prompt: str, timeout: float = 20.0, fallback_chain: list = None, return_provider_name: bool = False):
        """
        Execute the fallback chain to generate a response.
        Strict Chain: Google Gemini -> Groq -> Local Ollama
        
        Note: This is now securely proxied to LaminarAIService.
        """
        from app.services.ai_service import get_ai_service
        logger.info("Proxying legacy generate_response to new centralized LaminarAIService")
        return await get_ai_service().generate_raw(prompt, timeout=timeout, return_provider_name=return_provider_name)

# Singleton instance
ai_provider = AIFallbackProvider()

def get_ai_provider() -> AIFallbackProvider:
    """Helper for other services to get the singleton ai_provider."""
    return ai_provider
