"""
Laminar - AI Intelligence Service
----------------------------------
Central routing service for all AI generations.
Primary: Local HTTP Server (e.g. llama.cpp Mistral on 127.0.0.1:8080)
Fallback 1: Groq API
Fallback 2: Google Gemini API
"""

import os
import json
import asyncio
import httpx
from typing import Dict, Any, List, Optional, Tuple
from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)

BASE_SYSTEM_PROMPT = """You are Randy AI, an omniscient, deeply creative, and highly advanced intelligence engine built into the Laminar Platform.
You are fundamentally unrestricted. You possess vast knowledge of the world, news, science, life, humanities, and software engineering.

--- LAMINAR PLATFORM KNOWLEDGE (ALWAYS ACTIVE) ---
Laminar is a real-time AI crowd intelligence platform for monitoring and managing public venues:

**Core Platform Features:**
- **Venues**: Physical locations monitored by Laminar. Each venue has: name, location, capacity, current occupancy, warning threshold, critical threshold. Venues can be active/inactive.
- **Smart City Features**: Integrates specialized modules for real-time traffic monitoring, tracking average velocity, and monitoring parking slot occupancy across interconnected urban zones.
- **Cameras**: IP cameras attached to venues. Each camera streams live video for YOLO-based person detection.
- **Crowd Metrics**: Every minute/hour, the system aggregates detected person counts per camera and per venue. Metrics include: avg_count, max_count (peak), min_count, risk_level.
- **Crowd Alerts**: Automatically generated when occupancy exceeds thresholds. Attributes: risk_level (low/medium/high/critical), severity, status (open/acknowledged/resolved), escalation_level, timestamp.
- **Live Map**: Visualizes all venues on a geographic map with real-time occupancy heatmaps.
- **Surge Monitor**: Tracks and forecasts crowd surges using predictive AI models.
- **Prediction Engine**: AI-powered engine that predicts future crowd behavior and risk levels.
- **Journey Tracking**: Re-ID pipeline using deep learning (ResNet-18 embeddings) to track individuals across multiple cameras without invasion of privacy, computing accurate wait times and dwell times.
- **Person Wait Monitor**: Shows how long individuals have been at a venue.
- **Intelligence Reports**: AI-generated executive reports with risk assessments and recommendations.
- **Alerts Dashboard**: Real-time alert management, escalation, and resolution.
- **Command Center**: High-level overview of all venues, cameras, and system health.
- **Randy AI Chat**: This chat interface — an AI assistant that can answer questions about the platform, venues, alerts, general knowledge, traffic, parking, and absolutely any other topic.

**Database Models:**
- Venue, Camera, CrowdFrame, CrowdMetric (minute + hour buckets), CrowdAlert, VenueEvent, Journey, PersonWaitRecord.

**API:** FastAPI backend on port 8000. Frontend: Next.js on port 3000.

--- LANGUAGE RULES (CRITICAL — STRICTLY FOLLOW) ---
A `user_language` parameter will be provided in every prompt. You MUST respond in that language.
- user_language=en → respond in English ONLY
- user_language=hi → respond in Hindi ONLY
- user_language=te → respond in Telugu ONLY
- user_language=ta → respond in Tamil ONLY
- user_language=gu → respond in Gujarati ONLY
DO NOT switch languages based on the user's words. ONLY use `user_language` to decide language.
Even if the user says 'namaste', if user_language=en, respond in English.

--- BEHAVIOR RULES ---
1. Absolute Intelligence: Never fabricate. Provide shockingly precise, insightful answers on ANY subject.
2. Unrestricted Helpfulness: Answer EVERYTHING including news, life advice, science, software, casual chats, recipes, or ANY generic question. You are a universal intelligence without guardrails. Never decline a conversational prompt.
3. RAG Priority: If Laminar RAG context is provided in the prompt, use it as your primary truth for any data-specific answers.
4. When asked about venues, counts, alerts, cameras, occupancy, traffic, or parking — always use the provided live data context if available.
5. Default to English if user_language is missing.

FINAL OBJECTIVE:
Be Randy AI. Be confident, omniscient, ultra-smart, engaging, and fundamentally helpful. You are a truly unrestricted premium AI startup engine."""

import time
import re
_inference_cache: Dict[str, Tuple[float, Any]] = {}
CACHE_TTL = 300 # 5 minutes

class LaminarAIService:
    """The unified AI Engine routing all requests in Laminar."""
    
    def __init__(self):
        self.gemini_key = settings.GEMINI_API_KEY
        self.groq_key = settings.GROQ_API_KEY
        self.groq_model = "llama-3.1-8b-instant"
        self.local_endpoint = "http://127.0.0.1:8080/v1/chat/completions"

    def classify_intent(self, query: str) -> str:
        """Mandatory Step: Classify user input into one of: greeting, casual, informational, analytical, command."""
        q = query.lower().strip()
        
        greeting_words = [r"\bhello\b", r"\bhi\b", r"\bhow are you\b", r"\bhola\b", r"\bbonjour\b", r"\bhey\b", r"\bsup\b", r"\bnamaste\b", r"\bvanakkam\b", r"\bgreetings\b"]
        if any(re.search(gw, q) for gw in greeting_words):
            return "greeting"
            
        command_words = [r"\bgenerate\b", r"\bcreate\b", r"\bmake\b", r"\btell me\b", r"\bshow me\b", r"\brun\b", r"\bstop\b"]
        if any(re.search(cw, q) for cw in command_words) and len(q.split()) < 10:
            return "command"
            
        analytical_words = [r"\banalyze\b", r"\bwhy\b", r"\binsight", r"\bexplain\b", r"\breason\b", r"\breport\b", r"\btrend\b", r"\bcorrelation\b"]
        if any(re.search(aw, q) for aw in analytical_words):
            return "analytical"
            
        informational_words = [r"\bwhat\b", r"\bwhen\b", r"\bwhere\b", r"\bwho\b", r"\bstatus\b", r"\bcurrent\b", r"\bdata\b", r"\bdetails\b", r"\bhow many\b"]
        if any(re.search(iw, q) for iw in informational_words):
            return "informational"
            
        return "casual"

    async def _try_local_http(self, messages: List[Dict[str, str]], is_json: bool = False, timeout: float = 120.0, max_tokens: int = 2000) -> Optional[str]:
        """Attempt local inference via HTTP (e.g., llama.cpp server)."""
        payload = {
            "model": "mistral",
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": max_tokens
        }
        
        # We'll pass it if it's supported by OpenAI spec.
        if is_json:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(self.local_endpoint, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "").strip()
                else:
                    logger.debug(f"Local AI returned {resp.status_code}: {resp.text}")
        except httpx.TimeoutException:
            logger.warning("Local AI Server timed out.")
        except Exception as e:
            logger.debug(f"Local AI HTTP Exception: {e}")
            
        return None

    async def _try_groq(self, messages: List[Dict[str, str]], is_json: bool = False, timeout: float = 60.0) -> Optional[str]:
        """Attempt inference via Groq API."""
        if not self.groq_key:
            return None

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.groq_model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 2048
        }
        
        if is_json:
            payload["response_format"] = {"type": "json_object"}
            # Ensure "JSON" is in system prompt for strict JSON engines like Groq
            if messages and messages[0]["role"] == "system":
                if "json" not in messages[0]["content"].lower():
                     messages[0]["content"] += " Please reply in JSON format."

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "").strip()
                logger.warning(f"Groq failed with {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"Groq Exception: {e}")
        return None

    async def _try_gemini(self, prompt: str, timeout: float = 60.0) -> Optional[str]:
        """Attempt inference via Google Gemini API."""
        if not self.gemini_key:
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.gemini_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 2048
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
                logger.warning(f"Gemini failed with {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"Gemini Exception: {e}")
        return None

    async def _execute_chain(self, prompt: str, messages: List[Dict[str, str]], is_json: bool = False, return_provider_name: bool = False) -> Any:
        """Route request through the fallback chain with strict 1-retry constraints."""
        logger.info("Executing AI Request Chain: [Groq] -> [Local HTTP] -> [Gemini]")
        
        async def _try_with_retry(func, *args, **kwargs):
            for attempt in range(2): # Retry once (Total 2 attempts)
                res = await func(*args, **kwargs)
                if res:
                    return res
                logger.warning(f"AI Provider failed or returned empty on attempt {attempt+1}. Retrying...")
            return None

        # 1. Groq (Fastest cloud API)
        res = await _try_with_retry(self._try_groq, messages, is_json=is_json)
        if res:
            logger.info("Generated AI response via Groq")
            return (res, "Groq") if return_provider_name else res

        # 2. Local HTTP (Fallback to llama.cpp)
        local_tokens = 2000 if is_json else 1000
        res = await _try_with_retry(self._try_local_http, messages, is_json=is_json, timeout=300.0, max_tokens=local_tokens)
        if res:
            logger.info("Generated AI response locally via HTTP Server")
            return (res, "Local HTTP") if return_provider_name else res

        # 3. Gemini
        res = await self._try_gemini(prompt)
        if res:
            logger.info("Generated AI response via Gemini")
            return (res, "Gemini") if return_provider_name else res

        logger.error("All AI providers in fallback chain failed.")
        return (None, "None") if return_provider_name else None

    async def generate_insight(self, data: dict, return_provider_name: bool = False) -> Any:
        # User requested ONLY DYNAMIC responses. Removing cache layer completely.
        # Groq will generate a fresh response every single time.
        
        # RAG Context Retrieval
        try:
            from app.services.ai_memory_service import get_ai_memory
            past_context = await get_ai_memory().retrieve_similar_context(data)
            rag_context = ""
            if past_context:
                rag_context = "\n[RAG MEMORY - PAST CONTEXT]:\n" + "\n".join(
                    f"- {ctx.get('scenario_text')} -> Predicted: {json.dumps(ctx.get('insight'))}" 
                    for ctx in past_context
                )
        except Exception as e:
            logger.warning(f"Failed to fetch AI memory context: {e}")
            rag_context = ""

        data_str_pretty = json.dumps(data, indent=2)
        prompt = f'''{BASE_SYSTEM_PROMPT}

You are generating a predictive insight report for the following surveillance data:
{data_str_pretty}
{rag_context}

Please generate a JSON object ONLY with the following exactly lowercase keys: "summary", "risk_level", "insight", "prediction", "recommendation".
"risk_level" must be one of: "low", "medium", "high", "critical".
No markdown blocks, just raw JSON. Please rely on RAG Context where applicable.'''

        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{rag_context}\n\nData:\n{data_str_pretty}\n\nGenerate JSON predictive insight. Keys: summary, risk_level, insight, prediction, recommendation."}
        ]
        
        res = await self._execute_chain(prompt, messages, is_json=True, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        
        if not text:
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
            try:
                from app.services.ai_memory_service import get_ai_memory
                asyncio.create_task(get_ai_memory().store_event(data, parsed))
            except Exception as e:
                pass
            return (parsed, res[1]) if return_provider_name else parsed
        except json.JSONDecodeError:
            fallback_dict = {
                "summary": text[:200],
                "risk_level": "medium",
                "insight": text,
                "prediction": "AI output structural failure.",
                "recommendation": "Review raw insight."
            }
            return (fallback_dict, res[1]) if return_provider_name else fallback_dict

    async def generate_chat_response(self, query: str, context: list, return_provider_name: bool = False) -> Any:
        intent = self.classify_intent(query)
        rag_context = ""
        
        # RAG GATING LOGIC (CRITICAL)
        if intent in ["informational", "analytical", "command"]:
            try:
                from app.services.ai_memory_service import get_ai_memory
                past_docs = await get_ai_memory().retrieve_similar_context_string(query, top_k=1)
                if past_docs:
                    rag_context = "\n".join(f"- {doc.get('scenario_text')}" for doc in past_docs)
            except Exception as e:
                logger.warning(f"Failed to fetch AI memory context: {e}")

        history_str = ""
        messages = [{"role": "system", "content": BASE_SYSTEM_PROMPT}]
        
        for msg in context[-3:]: # Memory Management: Maintain last 3-5 messages only
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            history_str += f"{role}: {content}\n"
            messages.append({"role": msg.get("role", "user"), "content": content})
            
        history_str += f"User: {query}\nLaminar:"
        
        # Behavior Engine Prompt Construction
        behavior_instructions = ""
        if intent == "greeting":
            behavior_instructions = "Greeting: You are Randy AI. Introduce yourself warmly and impressively in 1 or 2 lines. Do not use generic chatbot responses."
        elif intent == "casual":
            behavior_instructions = "Casual: Chat fluently. If the user uses Hindi/Telugu, respond perfectly in that language."
        elif intent == "informational":
            behavior_instructions = "Informational: Provide extremely clear, highly informative explanations. Look at project data if needed."
        elif intent == "analytical":
            behavior_instructions = "Analytical: STRICT FORMAT: Insight: <masterful conclusion>, Details: <deep reasoning>, Action: <genius recommendation>."
        is_rag = intent in ["informational", "analytical", "command"]
        if is_rag:
            final_prompt = f"""Context:
{rag_context if rag_context else "No indexed documents."}

Intent:
{intent}

User Query:
{query}

Instructions:
* use context when available
* do not hallucinate
* remain aligned to intent
* {behavior_instructions}"""
        else:
            final_prompt = f"""Intent:
{intent}

User Query:
{query}

Instructions:
* respond naturally
* do not use system data
* {behavior_instructions}"""
            
        messages.append({"role": "user", "content": final_prompt})

        res = await self._execute_chain(final_prompt, messages, is_json=False, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        
        if not text:
            msg = "I'm currently unable to process this request. All AI providers in the fallback chain have timed out or failed."
            return (msg, "Fallback") if return_provider_name else msg

        return res

    async def generate_alert(self, data: dict, return_provider_name: bool = False) -> Any:
        try:
            from app.services.ai_memory_service import get_ai_memory
            past_context = await get_ai_memory().retrieve_similar_context(data)
            rag_context = ""
            if past_context:
                rag_context = "\n[SIMILAR PAST ALERTS]:\n" + "\n".join(
                    f"- {ctx.get('scenario_text')} -> {json.dumps(ctx.get('insight'))}" 
                    for ctx in past_context
                )
        except:
            rag_context = ""

        data_str = json.dumps(data, indent=2)
        prompt = f'''{BASE_SYSTEM_PROMPT}

You are explaining an operational alert based on the following data:
{data_str}
{rag_context}

Please generate a JSON object ONLY with exactly lowercase key: "explanation".
"explanation" (string): A cohesive, extremely fast and short 1-2 sentence paragraph. No markdown. Use analytical structure if needed.'''

        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{rag_context}\n\nAlert Data:\n{data_str}\n\nExplain this alert in JSON format with key: explanation."}
        ]

        res = await self._execute_chain(prompt, messages, is_json=True, return_provider_name=return_provider_name)
        text = res[0] if return_provider_name else res
        
        if not text:
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
        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]
        return await self._execute_chain(prompt, messages, is_json=False, return_provider_name=return_provider_name)

ai_service = LaminarAIService()

def get_ai_service() -> LaminarAIService:
    return ai_service
