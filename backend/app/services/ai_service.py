"""
Laminar - AI Intelligence Service
----------------------------------
Central routing service for all AI generations.
Primary: Local Phi-2 (via llama-cpp-python)
Fallback 1: Groq API
Fallback 2: Google Gemini API
"""

import os
import json
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)

# Safely resolve model path relative to project root
try:
    PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    LOCAL_MODEL_PATH = os.environ.get("LOCAL_MODEL_PATH", os.path.join(PROJECT_ROOT, "ai", "models", "phi-2.Q4_K_M.gguf"))
except Exception:
    # Fallback if path resolution fails, though it should be robust
    LOCAL_MODEL_PATH = "/tmp/phi-2.Q4_K_M.gguf" # A placeholder, actual path should be resolved

BASE_SYSTEM_PROMPT = """You are Laminar AI, an elite predictive intelligence and operations assistant.
You possess a continuous memory of operational incidents. Think analytically, deeply, and predict future states.

CRITICAL INSTRUCTIONS:
1. Always write cohesively and naturally as a human operations expert.
2. DO NOT use markdown bolding (asterisks) like **CONTEXT:** or **ANALYSIS:**. Speak organically.
3. Incorporate dwell times, flow movement, and historical context organically into your sentences.
4. Keep answers concise but insightful, always weaving your analysis into a fluid paragraph.
5. Do NOT list your reasoning steps out loud. Just deliver the final holistic insight.
You always provide rich, clear, and actionable intelligence.
Be concise, structured, and operationally vital. Avoid generic repetitive phrases."""

# In-memory LRU cache to avoid repeating exact queries within short windows
import time
_inference_cache: Dict[str, Tuple[float, Any]] = {}
CACHE_TTL = 300 # 5 minutes

class LaminarAIService:
    """The unified AI Engine routing all requests in Laminar."""
    
    _llama = None
    _llama_lock = asyncio.Lock()
    _llama_unavailable: bool = False  # Set to True once a load failure occurs — prevents repeated warnings

    def __init__(self):
        self.gemini_key = settings.GEMINI_API_KEY
        self.groq_key = settings.GROQ_API_KEY
        self.groq_model = "llama-3.1-8b-instant"

    async def _get_local_model(self):
        """Lazy-load the local model into memory."""
        # Short-circuit immediately if a previous load attempt permanently failed
        if LaminarAIService._llama_unavailable:
            return None
        if self._llama is None:
            async with self._llama_lock:
                if self._llama is None:
                    if not os.path.exists(LOCAL_MODEL_PATH):
                        logger.warning(f"Local AI Model not found at {LOCAL_MODEL_PATH}. Falling back to Cloud AI. (This warning won't repeat.)")
                        LaminarAIService._llama_unavailable = True
                        return None
                    try:
                        from llama_cpp import Llama
                        logger.info(f"Loading local model from {LOCAL_MODEL_PATH}...")
                        # Run blocking model load in a thread
                        self._llama = await asyncio.to_thread(
                            Llama,
                            model_path=LOCAL_MODEL_PATH,
                            n_ctx=2048, # Context window
                            n_threads=max(1, os.cpu_count() - 2),
                            n_gpu_layers=0,
                            verbose=False
                        )
                        logger.info("Local model loaded successfully.")
                    except ImportError:
                        logger.warning("llama-cpp-python is not installed — local model disabled. Falling back to Cloud AI. (This warning won't repeat.)")
                        LaminarAIService._llama_unavailable = True
                        return None
                    except Exception as e:
                        logger.warning(f"Failed to load local model: {e}. Falling back to Cloud AI. (This warning won't repeat.)")
                        LaminarAIService._llama_unavailable = True
                        return None
        return self._llama

    async def _try_local_phi2(self, prompt: str, is_json: bool = False, max_tokens: int = 500) -> Optional[str]:
        """Attempt local inference using Phi-2."""
        llm = await self._get_local_model()
        if not llm:
            return None
        
        try:
            # We run the blocking inference in a separate thread
            def _infer():
                # For Phi-2, it's a completions model unless it's an instruct fine-tune
                # We will just pass the prompt directly.
                return llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=0.2,
                    echo=False,
                    stop=["User:", "Laminar:", "\n\n\n"]
                )

            res = await asyncio.to_thread(_infer)
            if res and "choices" in res and len(res["choices"]) > 0:
                text = res["choices"][0]["text"].strip()
                if is_json:
                    # Best-effort extract JSON
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start != -1 and end != 0:
                        text = text[start:end]
                return text
        except Exception as e:
            logger.error(f"Local Phi-2 inference failed: {e}")
            
        return None

    async def _try_groq(self, messages: List[Dict[str, str]], is_json: bool = False, timeout: float = 10.0) -> Optional[str]:
        """Attempt inference via Groq API."""
        if not self.groq_key:
            return None

        import httpx
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.groq_model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 500
        }
        
        if is_json:
            payload["response_format"] = {"type": "json_object"}

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

    async def _try_gemini(self, prompt: str, timeout: float = 10.0) -> Optional[str]:
        """Attempt inference via Google Gemini API."""
        if not self.gemini_key:
            return None

        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.gemini_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 500
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

    async def _execute_chain(self, prompt: str, messages: List[Dict[str, str]], is_json: bool = False, return_provider_name: bool = False, max_tokens: int = 500) -> Any:
        """Route request through the fallback chain."""
        logger.info("Executing AI Request Chain: [Local Phi-2] -> [Groq] -> [Gemini]")
        
        # 1. Local Phi-2
        res = await self._try_local_phi2(prompt, is_json=is_json, max_tokens=max_tokens)
        if res:
            logger.info("Generated AI response locally via Phi-2")
            return (res, "Local Phi-2") if return_provider_name else res

        # 2. Groq
        res = await self._try_groq(messages, is_json=is_json)
        if res:
            logger.info("Generated AI response via Groq")
            return (res, "Groq") if return_provider_name else res

        # 3. Gemini
        res = await self._try_gemini(prompt)
        if res:
            logger.info("Generated AI response via Gemini")
            return (res, "Gemini") if return_provider_name else res

        logger.warning("All AI providers in fallback chain failed.")
        return (None, "None") if return_provider_name else None

    async def generate_insight(self, data: dict, return_provider_name: bool = False) -> Any:
        """
        Insight Mode (Predictive RAG Enhanced)
        Input: structured data
        Output Expectation: JSON Dictionary with prediction
        """
        # 1. Caching logic
        import hashlib
        data_str = json.dumps(data, sort_keys=True)
        cache_key = hashlib.md5(data_str.encode()).hexdigest()
        
        now = time.time()
        if cache_key in _inference_cache:
            timestamp, cached_res = _inference_cache[cache_key]
            if now - timestamp < CACHE_TTL:
                logger.info("Serving insight from cache (reduced latency).")
                return (cached_res, "Cache") if return_provider_name else cached_res

        # 2. Fetch relevant past operational memory context
        try:
            from app.services.ai_memory_service import get_ai_memory
            past_context = await get_ai_memory().retrieve_similar_context(data)
            memory_str = ""
            if past_context:
                memory_str = "\n\nRELEVANT PAST PATTERNS (MEMORY):\n" + "\n".join(
                    f"- {ctx.get('scenario_text')} -> Predicted/Actioned: {json.dumps(ctx.get('insight'))}" 
                    for ctx in past_context
                )
        except Exception as e:
            logger.warning(f"Failed to fetch AI memory context: {e}")
            memory_str = ""

        # 3. Build predictive prompt
        data_str_pretty = json.dumps(data, indent=2)
        prompt = f'''{BASE_SYSTEM_PROMPT}{memory_str}

You are generating a predictive insight report for the following surveillance data:
{data_str_pretty}

Please generate a JSON object ONLY with the following exactly lowercase keys: "summary", "risk_level", "insight", "prediction", "recommendation".
"risk_level" must be one of: "low", "medium", "high", "critical".
"prediction" should outline the expected development.
No markdown blocks, just raw JSON.'''

        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Generate JSON predictive insight for data:\n{data_str_pretty}{memory_str}\n\nKeys: summary, risk_level, insight, prediction, recommendation."}
        ]
        
        res = await self._execute_chain(prompt, messages, is_json=True, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        
        if not text:
            # Safest fallback
            fallback_dict = {
                "summary": "AI generation failed.",
                "risk_level": data.get("current_level", "medium"),
                "insight": "Could not generate insight due to system failure.",
                "prediction": "Unknown trajectory.",
                "recommendation": "Monitor situation manually."
            }
            return (fallback_dict, "Fallback") if return_provider_name else fallback_dict

        try:
            parsed = json.loads(text)
            
            # 4. Store successful insight into long-term memory
            try:
                from app.services.ai_memory_service import get_ai_memory
                asyncio.create_task(get_ai_memory().store_event(data, parsed))
            except Exception as e:
                logger.debug(f"Async memory storage failed: {e}")
                
            # Update cache
            _inference_cache[cache_key] = (now, parsed)
            
            return (parsed, res[1]) if return_provider_name else parsed
        except json.JSONDecodeError:
            # If AI didn't output valid json, wrap it
            fallback_dict = {
                "summary": text[:200],
                "risk_level": "medium",
                "insight": text,
                "prediction": "AI output structural failure.",
                "recommendation": "Review raw insight."
            }
            return (fallback_dict, res[1]) if return_provider_name else fallback_dict

    async def generate_chat_response(self, query: str, context: list, return_provider_name: bool = False) -> Any:
        """
        Chat Mode
        Input: User query string and historical context
        Output Expectation: Natural language response string
        """
        # Format history string for local model / gemini
        history_str = ""
        messages = [{"role": "system", "content": BASE_SYSTEM_PROMPT}]
        
        for msg in context[-5:]: # Keep last 5 messages for brevity
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            history_str += f"{role}: {content}\n"
            messages.append({"role": msg.get("role", "user"), "content": content})
            
        history_str += f"User: {query}\nLaminar:"
        messages.append({"role": "user", "content": query})

        prompt = f'''{BASE_SYSTEM_PROMPT}

CONVERSATION HISTORY:
{history_str}'''

        res = await self._execute_chain(prompt, messages, is_json=False, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        if not text:
            msg = "I'm currently unable to generate a response. Please check network connections or AI models readiness."
            return (msg, "Fallback") if return_provider_name else msg

        return res

    async def generate_alert(self, data: dict, return_provider_name: bool = False) -> Any:
        """
        Alert Mode
        Input: Alert data context
        Output Expectation: JSON Dictionary
        """
        data_str = json.dumps(data, indent=2)
        prompt = f'''{BASE_SYSTEM_PROMPT}

You are explaining an operational alert based on the following data:
{data_str}

Please generate a JSON object ONLY with the following exactly lowercase key: "explanation".
"explanation" (string): A cohesive, detailed 3-4 sentence natural language paragraph explaining exactly what the alert is, WHY the threshold was breached (analyzing dwell times, flow direction, and crowd density), and what specific action the staff must take to resolve it.
CRITICAL: The value for "explanation" MUST be a single cohesive paragraph string. Do NOT use nested objects, bullets, arrays, or sub-keys. No markdown blocks, just raw JSON.'''

        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Explain this alert in JSON format:\n{data_str}\n\nKey: explanation. Must be a flat string paragraph analyzing dwell and flow!"}
        ]

        res = await self._execute_chain(prompt, messages, is_json=True, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        
        if not text:
            # Safest fallback
            fallback_dict = {
                "alert": "Crowd alert detected.",
                "reason": "Thresholds or AI heuristics were met.",
                "action": "Investigate immediately."
            }
            return (fallback_dict, "Fallback") if return_provider_name else fallback_dict

        try:
            parsed = json.loads(text)
            return (parsed, res[1]) if return_provider_name else parsed
        except json.JSONDecodeError:
            fallback_dict = {
                "alert": "Alert triggered.",
                "reason": text[:200],
                "action": text[-200:]
            }
            return (fallback_dict, res[1]) if return_provider_name else fallback_dict
    
    async def generate_raw(self, prompt: str, timeout: float = 20.0, return_provider_name: bool = False) -> Any:
        """Raw generation fallback for backward compatibility."""
        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]
        return await self._execute_chain(prompt, messages, is_json=False, return_provider_name=return_provider_name, max_tokens=1000)

ai_service = LaminarAIService()

def get_ai_service() -> LaminarAIService:
    return ai_service
