from flask import Flask, request, jsonify
from datetime import timedelta, datetime
from flask_cors import CORS
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_ollama import ChatOllama
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
import os
import re
import logging
import time
import uuid
import hashlib
import json
from typing import Optional, Dict, Tuple, List
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ─────────────────────────────────────────────
# Environment & DB setup
# ─────────────────────────────────────────────
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}"
    f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      
    pool_recycle=300, 
    pool_size=5,
    max_overflow=10,
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
)

# These tables are ALWAYS blocked — no session can access them
HARDCODED_RESTRICTED_TABLES = [
    "customers", "orders", "order_items", "owners",
    "refresh_tokens", "wishlist", "users", "payments",
    "auth_tokens", "sessions", "admin"
]

# Full DB connection (used only for schema introspection internally)
_full_db = SQLDatabase(engine, sample_rows_in_table_info=0)

llm = ChatOllama(
    model=OLLAMA_MODEL,
    base_url=OLLAMA_BASE_URL,
    temperature=0.3
)

# ─────────────────────────────────────────────
# Security Layer — ALL SQL goes through this
# ─────────────────────────────────────────────

def get_all_db_tables() -> list[str]:
    """Get every table name that actually exists in the database, with retry."""
    import sqlalchemy
    for attempt in range(3):
        try:
            with engine.connect() as conn:
                result = conn.execute(
                    sqlalchemy.text(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                    )
                )
                return [row[0] for row in result]
        except Exception as e:
            logger.warning(f"get_all_db_tables attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error("All retries exhausted for get_all_db_tables")
                return []


def clean_sql(text: str) -> str:
    """Strip markdown fences from LLM SQL output."""
    text = text if isinstance(text, str) else text.get("query", "")
    cleaned = re.sub(r"```(?:sql|postgresql)?\s*([\s\S]*?)\s*```", r"\1", text).strip()
    # Also strip any trailing semicolons that could enable stacking
    return cleaned.rstrip(";").strip()


def extract_tables_from_sql(sql: str) -> list[str]:
    """
    Extract all table names referenced in a SQL query.
    Looks for: FROM x, JOIN x, UPDATE x, INSERT INTO x, DELETE FROM x
    """
    sql_upper = sql.upper()
    # Block any DDL/DML that could mutate data
    forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"]
    for kw in forbidden_keywords:
        if re.search(rf'\b{kw}\b', sql_upper):
            logger.warning(f"SECURITY: Blocked forbidden keyword '{kw}' in SQL")
            return None  # Signal hard block

    # Extract table names after FROM / JOIN keywords
    pattern = r'\b(?:FROM|JOIN|UPDATE|INTO)\s+(["\']?[\w]+["\']?)'
    matches = re.findall(pattern, sql, re.IGNORECASE)
    # Strip quotes
    return [m.strip('"\'').lower() for m in matches]


def validate_and_execute_sql(sql: str, allowed_table: str) -> str:
    """
    Hard security gate:
    1. Reject any non-SELECT statement
    2. Reject any table reference that isn't the allowed_table
    3. Reject any reference to restricted tables
    4. Only then execute
    """
    sql = clean_sql(sql)

    if not sql:
        return "NO_QUERY"

    # 1. Only allow SELECT
    if not sql.strip().upper().startswith("SELECT"):
        logger.warning(f"SECURITY BLOCK: Non-SELECT query attempted: {sql[:80]}")
        return "BLOCKED: Only SELECT queries are permitted."

    # 2. Extract all referenced tables
    referenced_tables = extract_tables_from_sql(sql)
    if referenced_tables is None:
        logger.warning(f"SECURITY BLOCK: Forbidden DDL/DML keyword in query")
        return "BLOCKED: This operation is not permitted."

    allowed_lower = allowed_table.lower()

    for table in referenced_tables:
        # Block hardcoded restricted tables
        if table in [t.lower() for t in HARDCODED_RESTRICTED_TABLES]:
            logger.warning(f"SECURITY BLOCK: Attempted access to restricted table '{table}'")
            return f"BLOCKED: Access to '{table}' is not permitted."

        # Block any table that isn't the session's assigned table
        if table != allowed_lower:
            logger.warning(f"SECURITY BLOCK: Table '{table}' is not the allowed table '{allowed_lower}'")
            return f"BLOCKED: Access to '{table}' is not allowed in this session."

    # 3. Verify the allowed table actually exists in DB
    existing_tables = get_all_db_tables()
    if allowed_lower not in [t.lower() for t in existing_tables]:
        logger.error(f"TABLE NOT FOUND: '{allowed_lower}' does not exist in DB")
        return f"TABLE_NOT_FOUND: The table '{allowed_lower}' does not exist."

    # 4. All clear — execute with a session-scoped DB view
    for attempt in range(3):
        try:
            session_db = SQLDatabase(engine, include_tables=[allowed_lower], sample_rows_in_table_info=0)
            tool = QuerySQLDatabaseTool(db=session_db)
            logger.info(f"EXECUTING (allowed_table={allowed_lower}): {sql}")
            result = tool.invoke(sql)
            logger.info(f"RESULT PREVIEW: {str(result)[:300]}")
            return result
        except Exception as e:
            logger.warning(f"SQL execute attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error(f"SQL execution error after retries: {e}")
                return f"QUERY_ERROR: {str(e)}"


# ─────────────────────────────────────────────
# Conversation Stages
# ─────────────────────────────────────────────
STAGES = {
    "GREETING":    "User just started or greeted",
    "BROWSING":    "User is exploring products / categories",
    "INTERESTED":  "User expressed interest in specific product(s)",
    "COMPARING":   "User wants to compare products",
    "DECIDING":    "User is close to making a decision",
    "CLOSING":     "User confirmed purchase intent",
    "SUPPORT":     "User has a question about warranty / policy / location"
}

# ─────────────────────────────────────────────
# Master Orchestrator Prompt
# ─────────────────────────────────────────────
ORCHESTRATOR_SYSTEM = """You are ShopMate, an expert conversational retail sales assistant.

## YOUR SHOP CONTEXT
- Shop: {shop_name}
- Location: {city}, {state}, {country}
- Product Category: {product_type}
- Shop ID: {shop_id}
- Available DB Table: {table_name}
- DB Schema Info: {db_schema}

## CONVERSATION STATE
- Current Stage: {stage}
- Conversation History:
{history}

## YOUR PERSONALITY
- Warm, knowledgeable, proactive salesperson
- You remember everything said earlier in the conversation
- You naturally guide users toward purchase decisions
- You compare products intelligently and make recommendations
- You highlight deals, warranties, and value propositions
- You NEVER break character or mention SQL/databases

## SALES FLOW YOU FOLLOW
GREETING → understand what they need
BROWSING → show options, ask clarifying questions
INTERESTED → go deeper on specific product(s), highlight features
COMPARING → compare 2-3 options side by side in plain language
DECIDING → address objections, reinforce value, nudge toward decision
CLOSING → confirm interest, mention next steps (visit store, call, etc.)
SUPPORT → answer policy/warranty/location questions

## WHAT YOU MUST DO
1. Analyze the user message + full conversation history
2. Decide the next conversation STAGE
3. Decide if you need to fetch data from the database (SQL query needed)
4. If SQL needed: write a precise PostgreSQL query scoped to this shop only
5. Formulate a warm, helpful, sales-oriented response

## SQL RULES (CRITICAL)
- ONLY query table: {table_name}
- NEVER use = for text columns. Use: lower(col) LIKE lower('%value%')
- ALWAYS add LIMIT 10 unless user asks for specific count
- NEVER access restricted tables: customers, orders, owners, refresh_tokens, wishlist
- Scope all queries to this shop's data only
- For "any/all" questions about the shop's products, query broadly

## OUTPUT FORMAT (strict JSON, no markdown)
{{
  "stage": "BROWSING|INTERESTED|COMPARING|DECIDING|CLOSING|SUPPORT|GREETING",
  "needs_sql": true|false,
  "sql_query": "SELECT ... FROM {table_name} WHERE ...",
  "thinking": "brief reasoning about what the user needs",
  "response_template": "your response to the user (use [SQL_RESULTS] as placeholder if needs_sql=true)"
}}

If needs_sql is false, set sql_query to null.
The response_template should be conversational, warm, and sales-focused.
When needs_sql is true, write [SQL_RESULTS] where the data will be inserted.
"""

RESPONSE_FORMATTER_PROMPT = """You are ShopMate, a warm retail assistant.

Shop: {shop_name} | Location: {city}, {state}

The assistant's plan was:
Thinking: {thinking}
Stage: {stage}
Response Template: {response_template}

SQL Results (if any): {sql_results}

Now write the FINAL response to the user's message: "{user_message}"

Rules:
- Use natural, conversational language
- NO tables, NO pipe characters, NO asterisks for bullets
- Use numbered lists or "First..., Second..., Also..." style
- If comparing products, describe differences clearly in sentences
- Highlight prices, features, and availability naturally
- End with a helpful question or suggestion to keep conversation going
- If SQL returned no results, say so politely and offer alternatives
- Keep it concise but complete (2-5 sentences for simple answers, more for comparisons)
- Remember the full conversation context when responding
"""


class ConversationalAgent:
    """Manages a full conversational retail session — strictly scoped to one table."""

    def __init__(self, session_data: dict):
        self.session = session_data

    @property
    def table_name(self) -> str:
        """
        Construct the shop's allowed table name.
        Format: {productType}_{shop_id}_{shopName_lowercase_underscored}
        """
        pt = (self.session.get("productType") or "products").lower().strip().replace(" ", "_")
        sid = str(self.session.get("shop_id") or "0")
        sn = (self.session.get("shopName") or "shop").lower().strip().replace(" ", "_")
        return f"{pt}_{sid}_{sn}"

    @property
    def history_text(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "(No previous messages — this is the start of the conversation)"
        lines = []
        for i, msg in enumerate(history[-8:], 1):
            lines.append(f"  [{i}] User: {msg.get('content', '')}")
            lines.append(f"      Assistant: {msg.get('response', '')}")
        return "\n".join(lines)

    @property
    def current_stage(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "GREETING"
        return history[-1].get("stage", "BROWSING")

    def get_scoped_schema(self) -> str:
        """
        Return schema for ONLY the session's allowed table.
        Never exposes schema for other tables.
        """
        allowed = self.table_name.lower()
        for attempt in range(3):
            try:
                existing = [t.lower() for t in get_all_db_tables()]
                if not existing:
                    if attempt < 2:
                        time.sleep(1)
                        continue
                    return f"Could not connect to database after retries."
                if allowed not in existing:
                    return f"Table '{allowed}' not found in database."
                scoped_db = SQLDatabase(engine, include_tables=[allowed], sample_rows_in_table_info=2)
                return scoped_db.get_table_info()
            except Exception as e:
                logger.warning(f"get_scoped_schema attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
                else:
                    logger.error(f"Schema fetch error: {e}")
                    return f"Could not retrieve schema for table '{allowed}'."

    def orchestrate(self, user_message: str) -> str:
        """Main entry: plan → (optionally query DB) → format response."""

        allowed_table = self.table_name
        scoped_schema = self.get_scoped_schema()

        # ── Step 1: LLM plans the response ──────────────────────────────
        system_prompt = ORCHESTRATOR_SYSTEM.format(
            shop_name=self.session.get("shopName", "Our Shop"),
            city=self.session.get("city", ""),
            state=self.session.get("state", ""),
            country=self.session.get("country", ""),
            product_type=self.session.get("productType", "all products"),
            shop_id=self.session.get("shop_id", ""),
            table_name=allowed_table,
            db_schema=scoped_schema,
            stage=self.current_stage,
            history=self.history_text
        )

        plan_response = llm.invoke([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ])

        plan = self._parse_plan(plan_response.content)
        logger.info(f"Plan → stage={plan.get('stage')}, needs_sql={plan.get('needs_sql')}, thinking={plan.get('thinking', '')[:80]}")

        # ── Step 2: Execute SQL through security gate ────────────────────
        sql_results = ""
        raw_sql = plan.get("sql_query") or ""

        if plan.get("needs_sql") and raw_sql:
            sql_results = validate_and_execute_sql(raw_sql, allowed_table)

            # If blocked or table missing, tell LLM so it can respond gracefully
            if sql_results.startswith("BLOCKED") or sql_results.startswith("TABLE_NOT_FOUND"):
                logger.warning(f"SQL blocked: {sql_results}")
                sql_results = f"[DATA UNAVAILABLE: {sql_results}]"
            elif sql_results.startswith("QUERY_ERROR"):
                logger.error(f"SQL error: {sql_results}")
                sql_results = "[DATA UNAVAILABLE: Query failed — the product may not exist or the filter returned no results]"

        # ── Step 3: Format final conversational response ─────────────────
        formatter_prompt = RESPONSE_FORMATTER_PROMPT.format(
            shop_name=self.session.get("shopName", "Our Shop"),
            city=self.session.get("city", ""),
            state=self.session.get("state", ""),
            response_template=plan.get("response_template", ""),
            thinking=plan.get("thinking", ""),
            stage=plan.get("stage", "BROWSING"),
            sql_results=sql_results if sql_results else "No database query was needed for this message.",
            user_message=user_message
        )

        final = llm.invoke([{"role": "user", "content": formatter_prompt}])
        response_text = final.content.strip()

        # ── Step 4: Persist to history ───────────────────────────────────
        self.session["chat_history"].append({
            "role": "user",
            "content": user_message,
            "response": response_text,
            "stage": plan.get("stage", "BROWSING"),
            "had_sql": bool(sql_results),
            "timestamp": datetime.now().isoformat()
        })
        self.session["current_stage"] = plan.get("stage", "BROWSING")

        return response_text

    def _parse_plan(self, content: str) -> dict:
        """Parse LLM JSON plan with fallback."""
        try:
            clean = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", content).strip()
            return json.loads(clean)
        except json.JSONDecodeError:
            logger.warning("Failed to parse plan JSON — using fallback conversational response")
            return {
                "stage": self.current_stage,
                "needs_sql": False,
                "sql_query": None,
                "thinking": "JSON parse failed",
                "response_template": content
            }


# ─────────────────────────────────────────────
# Flask App
# ─────────────────────────────────────────────
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["*"])
app.secret_key = "shopmate123"
app.permanent_session_lifetime = timedelta(hours=1)

RATE_LIMIT_SECONDS = 2
SESSION_TIMEOUT = 3600

_last_request_time = datetime.min
_last_request_text_hash: Optional[str] = None
chat_sessions: Dict[str, Dict] = {}


def is_rate_limited(text: str) -> bool:
    global _last_request_time, _last_request_text_hash
    current_time = datetime.now()
    text_hash = hashlib.md5(text.encode()).hexdigest()
    time_diff = (current_time - _last_request_time).total_seconds()
    if time_diff < RATE_LIMIT_SECONDS:
        return True
    if text_hash == _last_request_text_hash:
        return True
    _last_request_time = current_time
    _last_request_text_hash = text_hash
    return False


def cleanup_old_sessions() -> int:
    current_time = time.time()
    to_remove = [
        sid for sid, data in chat_sessions.items()
        if current_time - data.get("last_active", 0) > SESSION_TIMEOUT
    ]
    for sid in to_remove:
        del chat_sessions[sid]
    return len(to_remove)


def get_session_data(session_id: Optional[str] = None) -> Tuple[Optional[Dict], str]:
    if session_id is None:
        session_id = (request.headers.get('X-Session-ID') or
                      request.args.get('session_id'))

    if not session_id:
        return None, str(uuid.uuid4())

    if chat_sessions and hash(session_id) % 10 == 0:
        cleanup_old_sessions()

    if session_id not in chat_sessions:
        chat_sessions[session_id] = {
            "client": None,  # Ollama is stateless — no client object needed
            "chat_history": [],
            "shopName": None,
            "city": None,
            "state": None,
            "country": None,
            "productType": None,
            "shop_id": None,
            "current_stage": "GREETING",
            "last_active": time.time()
        }
    else:
        chat_sessions[session_id]["last_active"] = time.time()

    return chat_sessions[session_id], session_id


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.route("/start-chat", methods=["POST"])
def start_chat():
    data = request.get_json()

    session_id = (request.headers.get('X-Session-ID') or
                  request.args.get('session_id') or
                  (data.get("session_id") if data else None) or
                  str(uuid.uuid4()))

    session_data, returned_session_id = get_session_data(session_id)
    if session_data is None:
        session_data, returned_session_id = get_session_data()

    form_data = data.get("formData", {}) if data else {}
    session_data.update({
        "shopName": form_data.get("shopName"),
        "city": form_data.get("city"),
        "state": form_data.get("state"),
        "country": form_data.get("country"),
        "productType": form_data.get("productType"),
        "shop_id": form_data.get("shopId"),
        "chat_history": [],
        "current_stage": "GREETING"
    })

    shop_name = session_data.get("shopName", "the store")
    product_type = session_data.get("productType", "products")
    city = session_data.get("city", "")
    
    welcome_llm = llm.invoke([{
        "role": "user",
        "content": (
            f"You are ShopMate, a retail assistant for '{shop_name}' in {city} "
            f"specializing in {product_type}. "
            f"Give a warm, brief (2-3 sentences) welcome message that: "
            f"1) Greets the customer warmly, 2) Mentions the shop name and specialty, "
            f"3) Asks what they're looking for today. "
            f"Be natural, not robotic."
        )
    }])
    welcome_message = welcome_llm.content.strip()

    logger.info(f"Session started: {shop_name} in {city}")

    return jsonify({
        "message": "Chat session started",
        "session_id": returned_session_id,
        "welcome": welcome_message,
        "shop": shop_name,
        "location": f"{city}, {session_data.get('state')}, {session_data.get('country')}"
    }), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    text = (data.get("text", "") or "").strip() if data else ""

    if not text:
        return jsonify({"error": "Empty message"}), 400

    if is_rate_limited(text):
        return jsonify({
            "error": "Rate limited",
            "message": "Please wait a moment before sending another message"
        }), 429

    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({
            "error": "No active session",
            "message": "Please call /start-chat first to initialize your session."
        }), 400

    logger.info(f"[{session_id[:8]}] User: {text}")

    agent = ConversationalAgent(session_data)
    response = agent.orchestrate(text)

    logger.info(f"[{session_id[:8]}] Stage: {session_data.get('current_stage')} | Response: {response[:100]}...")

    return jsonify({
        "text": response,
        "stage": session_data.get("current_stage", "BROWSING"),
        "session_id": session_id
    }), 200


@app.route("/chat-history", methods=["GET"])
def get_chat_history():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404

    history = session_data.get("chat_history", [])
    return jsonify({
        "session_id": session_id,
        "stage": session_data.get("current_stage"),
        "chat_history": history,
        "count": len(history)
    }), 200


@app.route("/clear-chat", methods=["POST"])
def clear_chat():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404

    session_data["chat_history"] = []
    session_data["current_stage"] = "GREETING"
    return jsonify({"message": "Chat cleared and reset to GREETING stage"}), 200


@app.route("/get-session", methods=["GET"])
def get_session():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404

    return jsonify({
        "session_id": session_id,
        "shopName": session_data.get("shopName"),
        "city": session_data.get("city"),
        "state": session_data.get("state"),
        "country": session_data.get("country"),
        "productType": session_data.get("productType"),
        "shop_id": session_data.get("shop_id"),
        "current_stage": session_data.get("current_stage"),
        "chat_history_count": len(session_data.get("chat_history", [])),
        "active_sessions": len(chat_sessions)
    }), 200


@app.route("/sessions/status", methods=["GET"])
def sessions_status():
    return jsonify({
        "total_sessions": len(chat_sessions),
        "sessions": {
            sid[:8] + "...": {
                "shop": data.get("shopName"),
                "city": data.get("city"),
                "stage": data.get("current_stage"),
                "history_count": len(data.get("chat_history", [])),
                "last_active": datetime.fromtimestamp(data.get("last_active", 0)).isoformat()
            }
            for sid, data in chat_sessions.items()
        }
    }), 200


@app.route("/cleanup-sessions", methods=["POST"])
def cleanup_sessions_route():
    count = cleanup_old_sessions()
    return jsonify({
        "cleaned": count,
        "remaining": len(chat_sessions)
    }), 200


@app.route("/transcribe/status", methods=["GET"])
def transcribe_status():
    global _last_request_time
    current_time = datetime.now()
    time_diff = (current_time - _last_request_time).total_seconds()
    return jsonify({
        "rate_limited": time_diff < RATE_LIMIT_SECONDS,
        "cooldown_seconds": max(0, RATE_LIMIT_SECONDS - time_diff)
    }), 200


@app.route("/debug/table", methods=["GET"])
def debug_table():
    """
    Debug endpoint: shows what table this session maps to and if it exists.
    Remove or protect this in production.
    """
    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({"error": "No active session"}), 400

    agent = ConversationalAgent(session_data)
    table = agent.table_name
    existing = get_all_db_tables()
    exists = table.lower() in [t.lower() for t in existing]

    return jsonify({
        "session_id": session_id,
        "assigned_table": table,
        "table_exists_in_db": exists,
        "schema_preview": agent.get_scoped_schema() if exists else "Table not found",
        "all_db_tables_count": len(existing)
        # Note: we intentionally don't list all_db_tables to avoid leaking schema
    }), 200



    return jsonify({"status": "ShopMate Conversational AI is running"}), 200


if __name__ == "__main__":
    logger.info("Starting ShopMate Conversational Retail Assistant")
    app.run(host='0.0.0.0', port=3000, debug=False)