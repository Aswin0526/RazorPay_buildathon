from flask import Flask, request, jsonify
from datetime import timedelta, datetime
from flask_cors import CORS
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
import os
import re
import logging
import time
import uuid
import hashlib
import json
import base64
import asyncio
import inspect
from typing import Optional, Dict, Tuple, List, TypedDict, Annotated
from google import genai
from google.genai import types
from dotenv import load_dotenv

try:
    from toolbox_core import ToolboxClient
except Exception:  # pragma: no cover - optional dependency for MCP Toolbox integration
    ToolboxClient = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ─────────────────────────────────────────────
# Environment & DB setup
# ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMENI_API_KEY")
DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}"
    f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
)
MCP_TOOLBOX_URL = os.getenv("MCP_TOOLBOX_URL", "http://127.0.0.1:5005/mcp")
MCP_TOOLBOX_TOOLSET = os.getenv("MCP_TOOLBOX_TOOLSET", "shopmate")
MCP_TOOLBOX_SQL_TOOL = os.getenv("MCP_TOOLBOX_SQL_TOOL", "execute_sql")
MCP_TOOLBOX_TIMEOUT = float(os.getenv("MCP_TOOLBOX_TIMEOUT", "5"))
USE_MCP_TOOLBOX = os.getenv("USE_MCP_TOOLBOX", "false").lower() in {"1", "true", "yes", "on"}

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

# These tables are ALWAYS blocked for LLM-generated / Toolbox-executed SQL —
# no session can query them that way, regardless of assigned table.
# `wishlist` stays on this list deliberately: all wishlist access goes
# through the dedicated, parameterized functions below instead.
HARDCODED_RESTRICTED_TABLES = [
    "customers", "orders", "order_items", "owners",
    "refresh_tokens", "wishlist", "users", "payments",
    "auth_tokens", "sessions", "admin"
]

# Full DB connection (used only for schema introspection internally)
_full_db = SQLDatabase(engine, sample_rows_in_table_info=0)

# ── Text LLM (Gemini Flash) ───────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    google_api_key=GEMINI_API_KEY,
    temperature=0.3
)

# ── Vision client (Gemini native client — supports inline images) ─────────────
vision_client = genai.Client(api_key=GEMINI_API_KEY)


# ─────────────────────────────────────────────
# Image Analysis
# ─────────────────────────────────────────────
def analyze_image(image_base64: str, image_context: str, shop_name: str, product_type: str) -> str:
    """
    Analyze an image using Gemini Vision.
    image_base64 : full data-URL (data:image/jpeg;base64,...) or raw base64
    image_context: what the bot asked the user for (e.g. "skin type analysis")
    Returns a plain-text analysis string injected into the agent's context.
    """
    try:
        if "," in image_base64:
            header, raw_b64 = image_base64.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
        else:
            raw_b64 = image_base64
            mime_type = "image/jpeg"

        image_bytes = base64.b64decode(raw_b64)

        prompt = f"""You are a retail assistant for '{shop_name}' specializing in {product_type}.
The customer shared an image in the context of: "{image_context}"

Analyze the image carefully and provide:
1. What you clearly observe in the image
2. Specific attributes relevant to {product_type} (e.g. for cosmetics: skin type, tone, concerns; for fashion: style, color, size estimate; for electronics: model, condition, brand)
3. Concrete product recommendations based on what you see

Be specific, helpful, and retail-focused. Do not guess beyond what is visible."""

        response = vision_client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[
                types.Content(parts=[
                    types.Part(text=prompt),
                    types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_bytes))
                ])
            ]
        )

        analysis = response.text.strip()
        logger.info(f"Image analysis complete ({len(image_bytes)//1024}KB): {analysis[:120]}...")
        return analysis

    except Exception as e:
        logger.error(f"Image analysis error: {e}")
        return f"IMAGE_ANALYSIS_FAILED: {str(e)}"


# ─────────────────────────────────────────────
# Security Layer — ALL LLM/Toolbox-generated SQL goes through this
# ─────────────────────────────────────────────

def get_all_db_tables() -> list:
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
    return cleaned.rstrip(";").strip()


def extract_tables_from_sql(sql: str):
    """Extract all table names referenced in a SQL query."""
    sql_upper = sql.upper()
    forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"]
    for kw in forbidden_keywords:
        if re.search(rf'\b{kw}\b', sql_upper):
            logger.warning(f"SECURITY: Blocked forbidden keyword '{kw}' in SQL")
            return None
    pattern = r'\b(?:FROM|JOIN|UPDATE|INTO)\s+(["\']?[\w]+["\']?)'
    matches = re.findall(pattern, sql, re.IGNORECASE)
    return [m.strip('"\'').lower() for m in matches]


def normalize_toolbox_result(result) -> str:
    """Convert a Toolbox tool result into a plain string for the agent."""
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        if "content" in result:
            content = result["content"]
            if isinstance(content, list):
                chunks = []
                for item in content:
                    if isinstance(item, dict):
                        if "text" in item:
                            chunks.append(str(item["text"]))
                        else:
                            chunks.append(json.dumps(item, default=str))
                    else:
                        chunks.append(str(item))
                return "\n".join(chunks)
            return json.dumps(content, default=str)
        return json.dumps(result, default=str)
    if isinstance(result, (list, tuple)):
        return json.dumps(result, default=str)
    return str(result)


async def _invoke_toolbox_sql_tool(tool_name: str, arguments: dict) -> str:
    """Execute a safe SQL query through the configured MCP Toolbox server."""
    if ToolboxClient is None:
        raise RuntimeError("toolbox-core is not installed. Install it with: pip install toolbox-core")

    async with ToolboxClient(MCP_TOOLBOX_URL) as client:
        toolset = await client.load_toolset(MCP_TOOLBOX_TOOLSET)

        if isinstance(toolset, dict):
            tool_obj = toolset.get(tool_name)
            if tool_obj is None:
                tool_obj = next((v for k, v in toolset.items() if str(k).lower() == tool_name.lower()), None)
        elif isinstance(toolset, (list, tuple)):
            tool_obj = next((t for t in toolset if str(getattr(t, "name", "")).lower() == tool_name.lower()), None)
        else:
            tool_obj = toolset

        if tool_obj is None:
            raise RuntimeError(f"MCP Toolbox tool '{tool_name}' was not found in toolset '{MCP_TOOLBOX_TOOLSET}'")

        for method_name in ("invoke", "call", "__call__"):
            method = getattr(tool_obj, method_name, None)
            if callable(method):
                try:
                    result = method(arguments)
                except TypeError:
                    try:
                        result = method(**arguments)
                    except TypeError:
                        result = method()
                break
        else:
            raise RuntimeError(f"No callable method found on toolbox tool '{tool_name}'")

        if inspect.isawaitable(result):
            result = await result

        return normalize_toolbox_result(result)


def execute_query_via_toolbox(sql: str) -> str:
    """Run the database query through MCP Toolbox when configured."""
    try:
        if not USE_MCP_TOOLBOX:
            return "TOOLBOX_DISABLED"
        logger.info(f"EXECUTING via MCP Toolbox: {sql[:120]}")
        result = asyncio.run(asyncio.wait_for(
            _invoke_toolbox_sql_tool(MCP_TOOLBOX_SQL_TOOL, {"sql": sql}),
            timeout=MCP_TOOLBOX_TIMEOUT
        ))
        logger.info(f"TOOLBOX RESULT PREVIEW: {str(result)[:300]}")
        return result
    except asyncio.TimeoutError:
        logger.warning(f"MCP Toolbox request timed out after {MCP_TOOLBOX_TIMEOUT}s")
        return f"TOOLBOX_QUERY_ERROR: Timeout after {MCP_TOOLBOX_TIMEOUT}s"
    except Exception as e:
        logger.warning(f"MCP Toolbox query failed: {e}")
        return f"TOOLBOX_QUERY_ERROR: {str(e)}"


def safe_sql_identifier(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_]", "", str(name or "")).strip()
    return clean or "product"


def build_keyword_filters(field_name: str, keyword: str, include_phrase: bool = True) -> list:
    """Build a forgiving keyword filter for product names using token-based matching."""
    if not keyword:
        return []

    normalized = re.sub(r"[^a-zA-Z0-9]+", " ", str(keyword)).strip()
    tokens = [t for t in normalized.lower().split() if len(t) >= 2]
    if not tokens:
        return []

    filters = []
    if include_phrase:
        phrase = normalized.replace("'", "''").lower()
        if phrase:
            filters.append(f"LOWER({field_name}) LIKE LOWER('%{phrase}%')")

    for token in tokens:
        safe_token = token.replace("'", "''")
        filters.append(f"LOWER({field_name}) LIKE LOWER('%{safe_token}%')")

    seen = set()
    deduped = []
    for f in filters:
        if f not in seen:
            seen.add(f)
            deduped.append(f)
    return deduped


def build_toolbox_sql_from_args(tool_name: str, tool_args: dict, allowed_table: str) -> str:
    """Create a safe SELECT query from a structured tool call. SQL generation
    stays server-side, not in the model. NOTE: every branch now selects `*`
    (rather than a hand-picked column list) so the row's id column is always
    present — the agent needs it to call add_to_wishlist afterwards."""
    safe_table = safe_sql_identifier(allowed_table)
    limit = int((tool_args or {}).get("limit") or 10)
    limit = max(1, min(limit, 50))

    keyword = (tool_args or {}).get("keyword") or (tool_args or {}).get("product_name") or ""
    brand = (tool_args or {}).get("brand") or ""
    category = (tool_args or {}).get("category") or ""
    product_names = (tool_args or {}).get("product_names") or []
    products = [str(p).strip() for p in product_names if str(p).strip()]

    if tool_name == "list_categories":
        return f"SELECT DISTINCT category, COUNT(*) AS count FROM {safe_table} WHERE category IS NOT NULL GROUP BY category ORDER BY category LIMIT {limit};"

    if tool_name == "get_product_details":
        product_name = keyword or (tool_args or {}).get("product_name") or ""
        filters = build_keyword_filters("product_name", product_name)
        if brand:
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace(chr(39), chr(39)*2)}%')")
        where = f" WHERE {' OR '.join(filters)}" if filters else ""
        return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"

    if tool_name == "stock_check":
        filters = build_keyword_filters("product_name", keyword)
        if category:
            filters.append(f"LOWER(category) LIKE LOWER('%{category.replace(chr(39), chr(39)*2)}%')")
        if brand:
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace(chr(39), chr(39)*2)}%')")
        name_clause = " OR ".join(filters) if filters else "1=1"
        category_clause = f"LOWER(category) LIKE LOWER('%{category.replace(chr(39), chr(39)*2)}%')" if category else "1=1"
        brand_clause = f"LOWER(brand) LIKE LOWER('%{brand.replace(chr(39), chr(39)*2)}%')" if brand else "1=1"
        where = f" WHERE ({name_clause}) AND ({category_clause}) AND ({brand_clause})"
        return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"

    if tool_name == "compare_products":
        if products:
            expr = " OR ".join([f"LOWER(product_name) LIKE LOWER('%{p.replace(chr(39), chr(39)*2)}%')" for p in products[:3]])
            return f"SELECT * FROM {safe_table} WHERE {expr} LIMIT {limit};"
        return f"SELECT * FROM {safe_table} WHERE category IS NOT NULL LIMIT {limit};"

    if tool_name == "price_lookup":
        filters = build_keyword_filters("product_name", keyword)
        if category:
            filters.append(f"LOWER(category) LIKE LOWER('%{category.replace(chr(39), chr(39)*2)}%')")
        if brand:
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace(chr(39), chr(39)*2)}%')")
        where = f" WHERE {' OR '.join(filters)}" if filters else ""
        return f"SELECT * FROM {safe_table}{where} ORDER BY price LIMIT {limit};"

    # Default: generic product search (also used for tool_name == "search_products")
    filters = build_keyword_filters("product_name", keyword)
    if category:
        filters.append(f"LOWER(category) LIKE LOWER('%{category.replace(chr(39), chr(39)*2)}%')")
    if brand:
        filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace(chr(39), chr(39)*2)}%')")
    where = f" WHERE {' OR '.join(filters)}" if filters else ""
    return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"

NAMED_TOOLBOX_TOOLS = {
    "search_products", "list_categories", "get_product_details",
    "stock_check", "compare_products", "price_lookup",
}


def build_named_toolbox_args(tool_name: str, tool_args: dict, safe_table: str) -> dict:
    tool_args = tool_args or {}
    limit = int(tool_args.get("limit") or 10)
    limit = max(1, min(limit, 50))

    if tool_name == "list_categories":
        return {"result_limit": limit, "table": safe_table}

    if tool_name == "get_product_details":
        return {
            "product_name": tool_args.get("product_name") or tool_args.get("keyword") or "",
            "brand": tool_args.get("brand") or "",
            "result_limit": limit,
            "table": safe_table,
        }

    if tool_name == "compare_products":
        names = [str(p).strip() for p in (tool_args.get("product_names") or []) if str(p).strip()]
        names = (names + ["", "", ""])[:3]
        return {
            "product_a": names[0], "product_b": names[1], "product_c": names[2],
            "result_limit": limit, "table": safe_table,
        }

    return {
        "keyword": tool_args.get("keyword") or "",
        "category": tool_args.get("category") or "",
        "brand": tool_args.get("brand") or "",
        "result_limit": limit,
        "table": safe_table,
    }


def execute_named_toolbox_tool(tool_name: str, named_args: dict) -> str:
    try:
        if not USE_MCP_TOOLBOX:
            return "TOOLBOX_DISABLED"
        logger.info(f"EXECUTING via MCP Toolbox tool '{tool_name}' args={named_args}")
        result = asyncio.run(asyncio.wait_for(
            _invoke_toolbox_sql_tool(tool_name, named_args),
            timeout=MCP_TOOLBOX_TIMEOUT
        ))
        logger.info(f"TOOLBOX RESULT PREVIEW: {str(result)[:300]}")
        return result
    except asyncio.TimeoutError:
        logger.warning(f"MCP Toolbox request timed out after {MCP_TOOLBOX_TIMEOUT}s")
        return f"TOOLBOX_QUERY_ERROR: Timeout after {MCP_TOOLBOX_TIMEOUT}s"
    except Exception as e:
        logger.warning(f"MCP Toolbox query failed: {e}")
        return f"TOOLBOX_QUERY_ERROR: {str(e)}"


def execute_toolbox_tool(tool_name: str, tool_args: dict, allowed_table: str) -> str:
    tool_name = (tool_name or "search_products").strip()
    tool_args = tool_args or {}
    safe_table = safe_sql_identifier(allowed_table)

    if safe_table.lower() in [t.lower() for t in HARDCODED_RESTRICTED_TABLES]:
        logger.warning(f"SECURITY BLOCK: Attempted access to restricted table '{safe_table}'")
        return f"BLOCKED: Access to '{safe_table}' is not permitted."
    if safe_table.lower() not in [t.lower() for t in get_all_db_tables()]:
        return f"TABLE_NOT_FOUND: The table '{safe_table}' does not exist."

    if USE_MCP_TOOLBOX and tool_name in NAMED_TOOLBOX_TOOLS:
        named_args = build_named_toolbox_args(tool_name, tool_args, safe_table)
        boxed_result = execute_named_toolbox_tool(tool_name, named_args)
        if boxed_result and not boxed_result.startswith("TOOLBOX_QUERY_ERROR") and boxed_result != "TOOLBOX_DISABLED":
            return boxed_result
        logger.warning(f"MCP Toolbox tool '{tool_name}' failed/disabled; falling back to direct SQL")

    sql = build_toolbox_sql_from_args(tool_name, tool_args, allowed_table)
    return validate_and_execute_sql(sql, allowed_table)

def validate_and_execute_sql(sql: str, allowed_table: str) -> str:
    """Hard security gate + direct-engine execution. Toolbox is attempted
    upstream in execute_toolbox_tool now, not here."""
    sql = clean_sql(sql)
    if not sql:
        return "NO_QUERY"

    if not sql.strip().upper().startswith("SELECT"):
        logger.warning(f"SECURITY BLOCK: Non-SELECT query attempted: {sql[:80]}")
        return "BLOCKED: Only SELECT queries are permitted."

    referenced_tables = extract_tables_from_sql(sql)
    if referenced_tables is None:
        return "BLOCKED: This operation is not permitted."

    allowed_lower = allowed_table.lower()
    for table in referenced_tables:
        if table in [t.lower() for t in HARDCODED_RESTRICTED_TABLES]:
            logger.warning(f"SECURITY BLOCK: Attempted access to restricted table '{table}'")
            return f"BLOCKED: Access to '{table}' is not permitted."
        if table != allowed_lower:
            logger.warning(f"SECURITY BLOCK: Table '{table}' != allowed '{allowed_lower}'")
            return f"BLOCKED: Access to '{table}' is not allowed in this session."

    existing_tables = get_all_db_tables()
    if allowed_lower not in [t.lower() for t in existing_tables]:
        logger.error(f"TABLE NOT FOUND: '{allowed_lower}' does not exist in DB")
        return f"TABLE_NOT_FOUND: The table '{allowed_lower}' does not exist."

    for attempt in range(3):
        try:
            session_db = SQLDatabase(engine, include_tables=[allowed_lower], sample_rows_in_table_info=0)
            tool = QuerySQLDatabaseTool(db=session_db)
            logger.info(f"EXECUTING (table={allowed_lower}): {sql}")
            result = tool.invoke(sql)
            logger.info(f"RESULT PREVIEW: {str(result)[:300]}")
            return result
        except Exception as e:
            logger.warning(f"SQL execute attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                return f"QUERY_ERROR: {str(e)}"


def is_empty_sql_result(result: str) -> bool:
    """Detect if a SQL result genuinely has no data rows."""
    if not result:
        return True
    r = result.strip()
    empty_patterns = ["", "[]", "()", "None", "no results", "0 rows", "NO_QUERY", "[]\n", "(\n)"]
    if r.lower() in [p.lower() for p in empty_patterns]:
        return True
    lines = [l.strip() for l in r.split("\n") if l.strip()]
    if len(lines) == 0:
        return True
    if all(set(l) <= set("-+|= ") for l in lines):
        return True
    return False


def run_shop_query(tool_name: str, tool_args: dict, allowed_table: str) -> str:
    """Execute a read tool call and translate the raw gate/engine output into
    a clean, LLM-facing marker string."""
    raw = execute_toolbox_tool(tool_name, tool_args, allowed_table)
    if raw.startswith("BLOCKED") or raw.startswith("TABLE_NOT_FOUND"):
        logger.warning(f"Query blocked: {raw}")
        return "[NO_RESULTS: Data access blocked]"
    if raw.startswith("QUERY_ERROR"):
        logger.error(f"Query error: {raw}")
        return "[NO_RESULTS: Query failed]"
    if is_empty_sql_result(raw):
        return "[NO_RESULTS: No matching products found in this shop's inventory]"
    return raw


# ─────────────────────────────────────────────
# Wishlist — dedicated, parameterized, direct-engine reads/writes.
# Deliberately NOT reachable through LLM-generated SQL or the MCP Toolbox
# `execute_sql` tool, since `wishlist` sits in HARDCODED_RESTRICTED_TABLES.
# ─────────────────────────────────────────────

def add_wishlist_item(cust_id, shop_id, product_id, product_name: str, item_type: str) -> dict:
    import sqlalchemy
    sql = sqlalchemy.text("""
        INSERT INTO wishlist (cust_id, shop_id, product_id, product_name, type)
        VALUES (:cust_id, :shop_id, :product_id, :product_name, :type)
        RETURNING wishlist_id, cust_id, shop_id, product_id, product_name, type, created_at
    """)
    for attempt in range(3):
        try:
            with engine.begin() as conn:
                row = conn.execute(sql, {
                    "cust_id": cust_id,
                    "shop_id": shop_id,
                    "product_id": product_id,
                    "product_name": product_name,
                    "type": item_type,
                }).fetchone()
                return dict(row._mapping)
        except Exception as e:
            logger.warning(f"add_wishlist_item attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                raise


def get_wishlist_items(cust_id, shop_id=None, limit: int = 25) -> list:
    import sqlalchemy
    where = "WHERE cust_id = :cust_id" + (" AND shop_id = :shop_id" if shop_id else "")
    sql = sqlalchemy.text(f"""
        SELECT wishlist_id, cust_id, shop_id, product_id, product_name, type, created_at
        FROM wishlist
        {where}
        ORDER BY created_at DESC
        LIMIT :limit
    """)
    params = {"cust_id": cust_id, "limit": limit}
    if shop_id:
        params["shop_id"] = shop_id
    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error(f"get_wishlist_items error: {e}")
        return []


def remove_wishlist_item(wishlist_id, cust_id) -> bool:
    import sqlalchemy
    sql = sqlalchemy.text("""
        DELETE FROM wishlist WHERE wishlist_id = :wishlist_id AND cust_id = :cust_id
        RETURNING wishlist_id
    """)
    try:
        with engine.begin() as conn:
            row = conn.execute(sql, {"wishlist_id": wishlist_id, "cust_id": cust_id}).fetchone()
            return row is not None
    except Exception as e:
        logger.error(f"remove_wishlist_item error: {e}")
        return False


# ─────────────────────────────────────────────
# Conversation Stages
# ─────────────────────────────────────────────
STAGES = [
    "GREETING", "BROWSING", "INTERESTED", "COMPARING",
    "DECIDING", "CLOSING", "SUPPORT", "AWAITING_IMAGE",
]

AGENT_SYSTEM_PROMPT = """You are ShopMate, an expert conversational retail sales assistant.
You work by calling tools — you never write SQL yourself, and you never invent products.

## YOUR SHOP CONTEXT
- Shop: {shop_name}
- Location: {city}, {state}, {country}
- Product Category: {product_type}
- Shop ID: {shop_id}
- Available DB Table: {table_name}
- DB Schema Info: {db_schema}
- Customer ID for this session: {cust_id}

## CONVERSATION STATE
- Current Stage: {stage}
- Conversation History:
{history}

## IMAGE ANALYSIS RESULT (if customer sent an image this turn)
{image_analysis}

## YOUR PERSONALITY
- Warm, knowledgeable, proactive salesperson
- You remember everything said earlier in the conversation
- You naturally guide users toward purchase decisions
- You compare products intelligently and make recommendations
- You highlight deals, warranties, and value propositions
- You NEVER break character or mention SQL, databases, tools, or "AI"

## SALES FLOW (used as the `stage` argument to finalize_response)
GREETING → understand what they need
BROWSING → show options, ask clarifying questions
INTERESTED → go deeper on specific product(s), highlight features
COMPARING → compare 2-3 options side by side in plain language
DECIDING → address objections, reinforce value, nudge toward decision
CLOSING → confirm interest, mention next steps (visit store, call, etc.)
SUPPORT → answer policy/warranty/location questions
AWAITING_IMAGE → you are asking for a photo this turn

## HOW YOU WORK
You have tools for searching this shop's inventory and for managing the
customer's wishlist. Call whichever tools you need, in whatever order makes
sense, and you may call several across multiple turns. When — and only when —
you are ready to speak to the customer, call `finalize_response` exactly once,
by itself, as your last action. Its `response_text` argument IS your reply to
the customer — do not also write a plain chat message.

## GROUNDING RULES — NEVER BREAK THESE
1. ONLY mention products that appeared in a tool result this conversation. NEVER invent, assume, or recall products from your training data.
2. If a search tool returns "[NO_RESULTS...]", you MUST tell the customer that item isn't available in this shop. Do not suggest specific alternative products unless you actually looked them up.
3. If a tool call fails or is blocked, don't expose that to the customer — just say you couldn't find it and offer to help differently.

## PRODUCT SEARCH TOOLS
- search_products(keyword, category, brand, limit): general search
- list_categories(limit): what categories/subcategories this shop carries
- get_product_details(product_name, brand): exact details for one named product
- stock_check(keyword, category, brand): availability
- compare_products(product_names): compare 2-3 named products
- price_lookup(keyword, category, brand): prices, cheapest first
All of these are scoped to table {table_name} only and return the full row
(including its id column) so you always have what you need for a wishlist add.

## WISHLIST TOOLS
- add_to_wishlist(product_id, product_name, product_type): saves ONE exact
  product. You must already know its real product_id from a prior search_products
  / get_product_details / stock_check / compare_products / price_lookup result
  in THIS conversation — never guess an id. If nothing has been looked up yet,
  call a search tool first. If more than one product could match what the
  customer said, do not guess — call finalize_response and ask which one they mean.
  product_type is optional; if unsure, leave it blank and it will default to
  this shop's category ({product_type}).
- view_wishlist(): lists everything already saved for this customer at this shop.
- remove_from_wishlist(wishlist_id): removes one saved item — get the wishlist_id
  from view_wishlist first, don't guess it.
- If {cust_id} is "unknown", wishlist tools will fail — in that case tell the
  customer (warmly, without mentioning databases) that they'll need to be
  signed in for you to save items, and don't retry the wishlist tool.

## IMAGES
If a photo would meaningfully help (skin type/tone for cosmetics, an outfit to
match, a broken device to replace, or the customer struggles to describe what
they want), call finalize_response with needs_image=true, image_context set to
what to photograph, and stage="AWAITING_IMAGE".
"""


def _dedupe_currency_escape(s: str) -> str:
    return s


# ─────────────────────────────────────────────
# LangGraph agentic loop
# ─────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


MAX_AGENT_ITERATIONS = 6


class LangGraphRetailAgent:
    """Tool-calling ReAct-style retail agent. One instance per request."""

    def __init__(self, session_data: dict):
        self.session = session_data
        self._scratch: dict = {}
        self._tools = self._build_tools()
        self._tool_map = {t.name: t for t in self._tools}
        self._llm_with_tools = llm.bind_tools(self._tools)
        self.graph = self._build_graph()

    @property
    def table_name(self) -> str:
        pt = (self.session.get("productType") or "products").lower().strip().replace(" ", "_")
        sid = str(self.session.get("shop_id") or "0")
        sn = (self.session.get("shopName") or "shop").lower().strip().replace(" ", "_")
        return f"{pt}_{sid}_{sn}"

    @property
    def history_text(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "(No previous messages — start of conversation)"
        lines = []
        for i, msg in enumerate(history[-8:], 1):
            lines.append(f"  [{i}] User: {msg.get('content', '')}")
            if msg.get("had_image"):
                lines.append(f"       [User sent an image: {msg.get('image_context', 'image')}]")
            lines.append(f"       Assistant: {msg.get('response', '')}")
        return "\n".join(lines)

    @property
    def current_stage(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "GREETING"
        return history[-1].get("stage", "BROWSING")

    def get_scoped_schema(self) -> str:
        allowed = self.table_name.lower()
        for attempt in range(3):
            try:
                existing = [t.lower() for t in get_all_db_tables()]
                if not existing:
                    if attempt < 2:
                        time.sleep(1)
                        continue
                    return "Could not connect to database after retries."
                if allowed not in existing:
                    return f"Table '{allowed}' not found in database."
                scoped_db = SQLDatabase(engine, include_tables=[allowed], sample_rows_in_table_info=2)
                return scoped_db.get_table_info()
            except Exception as e:
                logger.warning(f"get_scoped_schema attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
                else:
                    return f"Could not retrieve schema for table '{allowed}'."

    # ── Tools ──────────────────────────────────────────────────────────
    def _build_tools(self):
        allowed_table = self.table_name
        shop_id = self.session.get("shop_id")
        cust_id = self.session.get("cust_id")
        default_type = self.session.get("productType", "product")
        scratch = self._scratch

        @tool
        def search_products(keyword: str = "", category: str = "", brand: str = "", limit: int = 10) -> str:
            """Search this shop's product inventory by keyword, category, and/or brand.
            Returns matching rows (including their id column) as text, or a
            [NO_RESULTS...] marker if nothing matches."""
            scratch["had_sql"] = True
            return run_shop_query("search_products", {"keyword": keyword, "category": category, "brand": brand, "limit": limit}, allowed_table)

        @tool
        def list_categories(limit: int = 20) -> str:
            """List the product categories this shop carries."""
            scratch["had_sql"] = True
            return run_shop_query("list_categories", {"limit": limit}, allowed_table)

        @tool
        def get_product_details(product_name: str, brand: str = "") -> str:
            """Get full details (including id) for one specific named product."""
            scratch["had_sql"] = True
            return run_shop_query("get_product_details", {"product_name": product_name, "brand": brand}, allowed_table)

        @tool
        def stock_check(keyword: str = "", category: str = "", brand: str = "") -> str:
            """Check stock/availability for a product, category, or brand."""
            scratch["had_sql"] = True
            return run_shop_query("stock_check", {"keyword": keyword, "category": category, "brand": brand}, allowed_table)

        @tool
        def compare_products(product_names: List[str]) -> str:
            """Compare 2-3 named products side by side (price, stock, etc)."""
            scratch["had_sql"] = True
            return run_shop_query("compare_products", {"product_names": product_names}, allowed_table)

        @tool
        def price_lookup(keyword: str = "", category: str = "", brand: str = "") -> str:
            """Look up prices for a product, category, or brand (cheapest first)."""
            scratch["had_sql"] = True
            return run_shop_query("price_lookup", {"keyword": keyword, "category": category, "brand": brand}, allowed_table)

        @tool
        def add_to_wishlist(product_id: int, product_name: str, product_type: str = "") -> str:
            """Save one exact product to the customer's wishlist. You must
            already know the real product_id from a prior search/detail/stock/
            compare/price tool result this conversation — never guess an id."""
            if not cust_id:
                return "WISHLIST_ERROR: No customer is identified for this session — ask them to sign in before saving items."
            if not shop_id:
                return "WISHLIST_ERROR: No shop is identified for this session."
            try:
                item = add_wishlist_item(cust_id, shop_id, product_id, product_name, product_type or default_type)
                scratch.setdefault("wishlist_products", []).append(item)
                return f"WISHLIST_OK: Saved '{product_name}' (wishlist_id={item.get('wishlist_id')})."
            except Exception as e:
                logger.error(f"add_to_wishlist tool error: {e}")
                return f"WISHLIST_ERROR: Could not save that item ({e})."

        @tool
        def view_wishlist() -> str:
            """List everything already saved in this customer's wishlist for this shop."""
            if not cust_id:
                return "WISHLIST_ERROR: No customer is identified for this session."
            items = get_wishlist_items(cust_id, shop_id)
            scratch["wishlist_products"] = items
            return json.dumps(items, default=str) if items else "[NO_RESULTS: wishlist is empty]"

        @tool
        def remove_from_wishlist(wishlist_id: int) -> str:
            """Remove one item from the customer's wishlist by its wishlist_id
            (get this from view_wishlist first — never guess it)."""
            if not cust_id:
                return "WISHLIST_ERROR: No customer is identified for this session."
            ok = remove_wishlist_item(wishlist_id, cust_id)
            return "WISHLIST_OK: removed." if ok else "WISHLIST_ERROR: item not found or already removed."

        @tool
        def finalize_response(stage: str, response_text: str, needs_image: bool = False, image_context: str = "") -> str:
            """Call this LAST, alone, exactly once, when ready to answer the
            customer. stage must be one of: GREETING, BROWSING, INTERESTED,
            COMPARING, DECIDING, CLOSING, SUPPORT, AWAITING_IMAGE.
            response_text is the exact warm message to show the customer.
            Set needs_image=true + image_context if you want them to upload a photo."""
            scratch["final_stage"] = stage if stage in STAGES else "BROWSING"
            scratch["final_text"] = response_text
            scratch["needs_image"] = bool(needs_image)
            scratch["image_context"] = image_context or None
            return "OK"

        return [
            search_products, list_categories, get_product_details, stock_check,
            compare_products, price_lookup,
            add_to_wishlist, view_wishlist, remove_from_wishlist,
            finalize_response,
        ]

    # ── Graph ──────────────────────────────────────────────────────────
    def _build_graph(self):
        scratch = self._scratch
        tool_map = self._tool_map
        llm_with_tools = self._llm_with_tools

        def agent_node(state: AgentState):
            scratch["iterations"] = scratch.get("iterations", 0) + 1
            if scratch["iterations"] > MAX_AGENT_ITERATIONS:
                fallback_text = "Let me get you sorted — could you tell me a little more about what you're looking for?"
                scratch.setdefault("final_stage", self.current_stage)
                scratch.setdefault("final_text", fallback_text)
                return {"messages": [AIMessage(content=fallback_text)]}
            response = llm_with_tools.invoke(state["messages"])
            return {"messages": [response]}

        def tools_node(state: AgentState):
            last = state["messages"][-1]
            outputs = []
            for call in getattr(last, "tool_calls", []) or []:
                name = call.get("name")
                args = call.get("args", {}) or {}
                call_id = call.get("id")
                fn = tool_map.get(name)
                if fn is None:
                    result = f"ERROR: unknown tool '{name}'"
                else:
                    try:
                        result = fn.invoke(args)
                    except Exception as e:
                        logger.error(f"Tool '{name}' failed: {e}")
                        result = f"ERROR: {e}"
                outputs.append(ToolMessage(content=str(result), tool_call_id=call_id, name=name))
            return {"messages": outputs}

        def route_from_agent(state: AgentState) -> str:
            last = state["messages"][-1]
            tool_calls = getattr(last, "tool_calls", None) or []
            if tool_calls:
                return "tools"
            # Defensive fallback: model answered without calling finalize_response.
            if scratch.get("final_text") is None:
                scratch["final_text"] = last.content or "Could you tell me a bit more about what you're looking for?"
                scratch.setdefault("final_stage", self.current_stage)
            return "end"

        def route_from_tools(state: AgentState) -> str:
            return "end" if scratch.get("final_text") is not None else "agent"

        graph = StateGraph(AgentState)
        graph.add_node("agent", agent_node)
        graph.add_node("tools", tools_node)
        graph.set_entry_point("agent")
        graph.add_conditional_edges("agent", route_from_agent, {"tools": "tools", "end": END})
        graph.add_conditional_edges("tools", route_from_tools, {"agent": "agent", "end": END})
        return graph.compile()

    # ── Entry point ────────────────────────────────────────────────────
    def orchestrate(self, user_message: str, image_base64: Optional[str] = None) -> dict:
        allowed_table = self.table_name
        scoped_schema = self.get_scoped_schema()

        image_analysis = ""
        image_context_used = ""
        if image_base64:
            last = self.session.get("chat_history", [])
            image_context_used = (
                last[-1].get("image_context", "general product identification")
                if last else "general product identification"
            )
            logger.info(f"Analyzing image in context: {image_context_used}")
            image_analysis = analyze_image(
                image_base64, image_context_used,
                self.session.get("shopName", "Our Shop"),
                self.session.get("productType", "products"),
            )

        cust_id = self.session.get("cust_id")
        system_prompt = AGENT_SYSTEM_PROMPT.format(
            shop_name=self.session.get("shopName", "Our Shop"),
            city=self.session.get("city", ""),
            state=self.session.get("state", ""),
            country=self.session.get("country", ""),
            product_type=self.session.get("productType", "all products"),
            shop_id=self.session.get("shop_id", ""),
            table_name=allowed_table,
            db_schema=scoped_schema,
            cust_id=cust_id if cust_id else "unknown",
            stage=self.current_stage,
            history=self.history_text,
            image_analysis=image_analysis if image_analysis else "(No image provided this turn)",
        )

        self._scratch.clear()
        self.graph.invoke({
            "messages": [SystemMessage(content=system_prompt), HumanMessage(content=user_message)]
        })

        final_stage = self._scratch.get("final_stage") or self.current_stage
        response_text = self._scratch.get("final_text") or "Sorry, could you rephrase that?"
        needs_image = bool(self._scratch.get("needs_image"))
        image_context = self._scratch.get("image_context")
        wishlist_products = self._scratch.get("wishlist_products", [])
        had_sql = bool(self._scratch.get("had_sql"))

        self.session["chat_history"].append({
            "role": "user",
            "content": user_message,
            "response": response_text,
            "stage": final_stage,
            "had_sql": had_sql,
            "had_image": bool(image_base64),
            "image_context": image_context or image_context_used,
            "timestamp": datetime.now().isoformat(),
        })
        self.session["current_stage"] = final_stage

        return {
            "text": response_text,
            "needs_image": needs_image,
            "image_context": image_context,
            "needs_wishlist": bool(wishlist_products),
            "wishlist_keyword": None,
            "wishlist_products": wishlist_products,
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


# ─────────────────────────────────────────────
# Conversation Analysis — DB persistence (unchanged from prior version)
# ─────────────────────────────────────────────

def save_analysis_to_db(record: dict) -> Optional[int]:
    import sqlalchemy
    sql = sqlalchemy.text("""
        INSERT INTO conversation_analyses (
            session_id, user_id, shop_id, shop_name,
            city, state, country, product_type,
            started_at, ended_at, duration_minutes, turn_count,
            outcome, final_stage, summary, customer_intent,
            sentiment_arc, stage_progression,
            products_discussed, key_insights,
            missed_opportunities, recommended_followup,
            images_shared, sql_queries_made,
            stages_reached, full_analysis, conversation_transcript
        ) VALUES (
            :session_id, :user_id, :shop_id, :shop_name,
            :city, :state, :country, :product_type,
            :started_at, :ended_at, :duration_minutes, :turn_count,
            :outcome, :final_stage, :summary, :customer_intent,
            :sentiment_arc, :stage_progression,
            :products_discussed, :key_insights,
            :missed_opportunities, :recommended_followup,
            :images_shared, :sql_queries_made,
            :stages_reached, :full_analysis, :conversation_transcript
        )
        RETURNING id
    """)

    metrics = record.get("analysis", {}).get("metrics", {})
    a = record.get("analysis", {})

    params = {
        "session_id": record.get("session_id"),
        "user_id": record.get("user_id"),
        "shop_id": str(record.get("shop_id", "")),
        "shop_name": record.get("shop_name"),
        "city": record.get("city"),
        "state": record.get("state"),
        "country": record.get("country"),
        "product_type": record.get("product_type"),
        "started_at": record.get("started_at"),
        "ended_at": record.get("ended_at"),
        "duration_minutes": record.get("duration_minutes", 0),
        "turn_count": record.get("turn_count", 0),
        "outcome": a.get("outcome", "UNKNOWN"),
        "final_stage": a.get("final_stage", "UNKNOWN"),
        "summary": a.get("summary", ""),
        "customer_intent": a.get("customer_intent", ""),
        "sentiment_arc": a.get("sentiment_arc", ""),
        "stage_progression": metrics.get("stage_progression", ""),
        "products_discussed": json.dumps(a.get("products_discussed", [])),
        "key_insights": json.dumps(a.get("key_insights", [])),
        "missed_opportunities": json.dumps(a.get("missed_opportunities", [])),
        "recommended_followup": a.get("recommended_followup", ""),
        "images_shared": metrics.get("images_shared", 0),
        "sql_queries_made": metrics.get("sql_queries_made", 0),
        "stages_reached": json.dumps(metrics.get("stages_reached", [])),
        "full_analysis": json.dumps(a),
        "conversation_transcript": json.dumps(record.get("conversation", [])),
    }

    for attempt in range(3):
        try:
            with engine.begin() as conn:
                result = conn.execute(sql, params)
                row_id = result.fetchone()[0]
                logger.info(f"Analysis saved to DB: id={row_id}, session={record.get('session_id','')[:8]}")
                return row_id
        except Exception as e:
            logger.warning(f"save_analysis_to_db attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error(f"Failed to save analysis after 3 attempts: {e}")
                return None


def fetch_analyses_from_db(shop_id: Optional[str] = None, limit: int = 100) -> list:
    import sqlalchemy
    try:
        if shop_id:
            sql = sqlalchemy.text("""
                SELECT id, session_id, user_id, shop_id, shop_name, city, state,
                       started_at, ended_at, duration_minutes, turn_count,
                       outcome, final_stage, summary, customer_intent,
                       sentiment_arc, products_discussed, key_insights,
                       recommended_followup, created_at
                FROM conversation_analyses
                WHERE shop_id = :shop_id
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            params = {"shop_id": str(shop_id), "limit": limit}
        else:
            sql = sqlalchemy.text("""
                SELECT id, session_id, user_id, shop_id, shop_name, city, state,
                       started_at, ended_at, duration_minutes, turn_count,
                       outcome, final_stage, summary, customer_intent,
                       sentiment_arc, products_discussed, key_insights,
                       recommended_followup, created_at
                FROM conversation_analyses
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            params = {"limit": limit}

        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error(f"fetch_analyses_from_db error: {e}")
        return []


def fetch_analyses_stats_from_db(shop_id: Optional[str] = None) -> dict:
    import sqlalchemy
    try:
        where = "WHERE shop_id = :shop_id" if shop_id else ""
        sql = sqlalchemy.text(f"""
            SELECT
                COUNT(*)                                        AS total_conversations,
                ROUND(AVG(duration_minutes)::numeric, 1)        AS avg_duration_minutes,
                ROUND(AVG(turn_count)::numeric, 1)              AS avg_turns,
                SUM(images_shared)                              AS total_images_shared,
                outcome,
                COUNT(*) OVER (PARTITION BY outcome)            AS outcome_count
            FROM conversation_analyses
            {where}
            GROUP BY outcome
        """)
        params = {"shop_id": str(shop_id)} if shop_id else {}

        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            if not rows:
                return {}

            first = dict(rows[0]._mapping)
            outcomes = {dict(r._mapping)["outcome"]: dict(r._mapping)["outcome_count"] for r in rows}
            return {
                "total_conversations": first["total_conversations"],
                "avg_duration_minutes": float(first["avg_duration_minutes"] or 0),
                "avg_turns": float(first["avg_turns"] or 0),
                "total_images_shared": first["total_images_shared"] or 0,
                "outcome_breakdown": outcomes,
            }
    except Exception as e:
        logger.error(f"fetch_analyses_stats_from_db error: {e}")
        return {}


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
        session_id = (request.headers.get('X-Session-ID') or request.args.get('session_id'))
    if not session_id:
        return None, str(uuid.uuid4())

    if chat_sessions and hash(session_id) % 10 == 0:
        cleanup_old_sessions()

    if session_id not in chat_sessions:
        chat_sessions[session_id] = {
            "chat_history": [],
            "shopName": None,
            "city": None,
            "state": None,
            "country": None,
            "productType": None,
            "shop_id": None,
            "cust_id": None,
            "current_stage": "GREETING",
            "last_active": time.time(),
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
    session_id = (
        request.headers.get('X-Session-ID') or
        request.args.get('session_id') or
        (data.get("session_id") if data else None) or
        str(uuid.uuid4())
    )

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
        "cust_id": form_data.get("custId"),  # NEW: identifies the customer for wishlist ops
        "chat_history": [],
        "current_stage": "GREETING",
    })

    shop_name = session_data.get("shopName", "the store")
    product_type = session_data.get("productType", "products")
    city = session_data.get("city", "")

    welcome_llm = llm.invoke([{
        "role": "user",
        "content": (
            f"You are ShopMate, a retail assistant for '{shop_name}' in {city} "
            f"specializing in {product_type}. "
            f"Give a warm, brief (2-3 sentences) welcome message: "
            f"1) Greet warmly, 2) Mention shop name and specialty, "
            f"3) Ask what they're looking for. Be natural, not robotic."
        )
    }])
    welcome_message = welcome_llm.content.strip()
    logger.info(f"Session started: {shop_name} in {city}")

    return jsonify({
        "message": "Chat session started",
        "session_id": returned_session_id,
        "welcome": welcome_message,
        "shop": shop_name,
        "location": f"{city}, {session_data.get('state')}, {session_data.get('country')}",
    }), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    text = (data.get("text", "") or "").strip()
    image_b64 = data.get("image") or None

    if not text:
        return jsonify({"error": "Empty message"}), 400

    if is_rate_limited(text):
        return jsonify({"error": "Rate limited", "message": "Please wait a moment before sending another message"}), 429

    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({"error": "No active session", "message": "Please call /start-chat first to initialize your session."}), 400

    has_image = bool(image_b64)
    logger.info(f"[{session_id[:8]}] User: {text} {'[+IMAGE]' if has_image else ''}")

    agent = LangGraphRetailAgent(session_data)
    result = agent.orchestrate(text, image_b64)

    logger.info(
        f"[{session_id[:8]}] Stage: {session_data.get('current_stage')} | "
        f"needs_image={result['needs_image']} | Response: {result['text'][:100]}..."
    )

    return jsonify({
        "text": result["text"],
        "needs_image": result["needs_image"],
        "image_context": result["image_context"],
        "needs_wishlist": result.get("needs_wishlist", False),
        "wishlist_keyword": result.get("wishlist_keyword"),
        "wishlist_products": result.get("wishlist_products", []),
        "stage": session_data.get("current_stage", "BROWSING"),
        "session_id": session_id,
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
        "count": len(history),
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
        "cust_id": session_data.get("cust_id"),
        "current_stage": session_data.get("current_stage"),
        "chat_history_count": len(session_data.get("chat_history", [])),
        "active_sessions": len(chat_sessions),
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
                "last_active": datetime.fromtimestamp(data.get("last_active", 0)).isoformat(),
            }
            for sid, data in chat_sessions.items()
        },
    }), 200


@app.route("/cleanup-sessions", methods=["POST"])
def cleanup_sessions_route():
    count = cleanup_old_sessions()
    return jsonify({"cleaned": count, "remaining": len(chat_sessions)}), 200


@app.route("/transcribe/status", methods=["GET"])
def transcribe_status():
    global _last_request_time
    current_time = datetime.now()
    time_diff = (current_time - _last_request_time).total_seconds()
    return jsonify({
        "rate_limited": time_diff < RATE_LIMIT_SECONDS,
        "cooldown_seconds": max(0, RATE_LIMIT_SECONDS - time_diff),
    }), 200


@app.route("/debug/table", methods=["GET"])
def debug_table():
    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({"error": "No active session"}), 400
    agent = LangGraphRetailAgent(session_data)
    table = agent.table_name
    existing = get_all_db_tables()
    exists = table.lower() in [t.lower() for t in existing]
    return jsonify({
        "session_id": session_id,
        "assigned_table": table,
        "table_exists_in_db": exists,
        "schema_preview": agent.get_scoped_schema() if exists else "Table not found",
        "all_db_tables_count": len(existing),
    }), 200


# ── Wishlist REST endpoints (for a UI "save" button, outside the chat too) ──
@app.route("/wishlist", methods=["GET"])
def wishlist_get():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    cust_id = request.args.get("cust_id") or session_data.get("cust_id")
    if not cust_id:
        return jsonify({"error": "No customer identified", "items": []}), 400
    shop_id = request.args.get("shop_id") or session_data.get("shop_id")
    items = get_wishlist_items(cust_id, shop_id)
    return jsonify({"cust_id": cust_id, "shop_id": shop_id, "items": items, "count": len(items)}), 200


@app.route("/wishlist", methods=["POST"])
def wishlist_add():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    cust_id = session_data.get("cust_id")
    shop_id = session_data.get("shop_id")
    if not cust_id or not shop_id:
        return jsonify({"error": "Session is missing cust_id/shop_id — call /start-chat with custId first"}), 400

    data = request.get_json() or {}
    product_id = data.get("product_id")
    product_name = data.get("product_name")
    item_type = data.get("type") or session_data.get("productType", "product")
    if not product_id or not product_name:
        return jsonify({"error": "product_id and product_name are required"}), 400

    try:
        item = add_wishlist_item(cust_id, shop_id, product_id, product_name, item_type)
        return jsonify({"message": "Added to wishlist", "item": item}), 200
    except Exception as e:
        return jsonify({"error": f"Could not add to wishlist: {e}"}), 500


@app.route("/wishlist/<int:wishlist_id>", methods=["DELETE"])
def wishlist_remove(wishlist_id):
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    cust_id = session_data.get("cust_id")
    if not cust_id:
        return jsonify({"error": "No customer identified"}), 400
    ok = remove_wishlist_item(wishlist_id, cust_id)
    if not ok:
        return jsonify({"error": "Item not found or already removed"}), 404
    return jsonify({"message": "Removed from wishlist", "wishlist_id": wishlist_id}), 200


ANALYSIS_PROMPT = """You are a retail analytics expert. Analyze this conversation between a customer and a retail assistant.

Shop: {shop_name} ({shop_id})
Location: {city}, {state}, {country}
Product Category: {product_type}
Session ID: {session_id}
Duration: {duration_minutes} minutes
Total Turns: {turn_count}

Conversation:
{conversation_text}

Provide a structured JSON analysis with EXACTLY this format (no markdown, raw JSON only):
{{
  "summary": "2-3 sentence plain English summary of what happened in the conversation",
  "outcome": "PURCHASED_INTENT | BROWSED_ONLY | ABANDONED | SUPPORT_RESOLVED | UNDECIDED",
  "final_stage": "the last stage reached in the sales funnel",
  "metrics": {{
    "turns": {turn_count},
    "duration_minutes": {duration_minutes},
    "images_shared": {images_shared},
    "sql_queries_made": {sql_queries},
    "stages_reached": [],
    "stage_progression": "linear | jumped_around | stalled"
  }},
  "customer_intent": "what the customer was actually looking for",
  "products_discussed": ["list of specific products or categories mentioned"],
  "key_insights": [
    "insight 1 about customer behavior or preference",
    "insight 2",
    "insight 3"
  ],
  "missed_opportunities": ["things the bot could have done better"],
  "sentiment_arc": "started_positive | started_negative | improved | declined | neutral_throughout",
  "recommended_followup": "what a human sales agent should do if this customer visits the store"
}}"""


@app.route("/analyze-session", methods=["POST"])
def analyze_session():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404

    chat_history = session_data.get("chat_history", [])
    if not chat_history:
        return jsonify({"message": "No conversation to analyze", "analysis": None}), 200

    conversation_lines = []
    for i, msg in enumerate(chat_history, 1):
        conversation_lines.append(f"Turn {i}:")
        conversation_lines.append(f"  Customer: {msg.get('content', '')}")
        if msg.get("had_image"):
            conversation_lines.append(f"  [Customer sent image: {msg.get('image_context', '')}]")
        conversation_lines.append(f"  Assistant: {msg.get('response', '')}")
        conversation_lines.append(f"  [Stage: {msg.get('stage', '?')}]")
        conversation_lines.append("")
    conversation_text = "\n".join(conversation_lines)

    turn_count = len(chat_history)
    images_shared = sum(1 for m in chat_history if m.get("had_image"))
    sql_queries = sum(1 for m in chat_history if m.get("had_sql"))
    stages_reached = list(dict.fromkeys([m.get("stage", "UNKNOWN") for m in chat_history]))

    try:
        t_first = datetime.fromisoformat(chat_history[0].get("timestamp", datetime.now().isoformat()))
        t_last = datetime.fromisoformat(chat_history[-1].get("timestamp", datetime.now().isoformat()))
        duration_minutes = round((t_last - t_first).total_seconds() / 60, 1)
    except Exception:
        duration_minutes = 0

    try:
        prompt = ANALYSIS_PROMPT.format(
            shop_name=session_data.get("shopName", "Unknown"),
            shop_id=session_data.get("shop_id", "Unknown"),
            city=session_data.get("city", ""),
            state=session_data.get("state", ""),
            country=session_data.get("country", ""),
            product_type=session_data.get("productType", ""),
            session_id=session_id,
            duration_minutes=duration_minutes,
            turn_count=turn_count,
            images_shared=images_shared,
            sql_queries=sql_queries,
            conversation_text=conversation_text,
        )

        response = llm.invoke([{"role": "user", "content": prompt}])
        raw = response.content.strip()
        clean = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", raw).strip()
        llm_analysis = json.loads(clean)
        llm_analysis["metrics"]["stages_reached"] = stages_reached

    except Exception as e:
        logger.error(f"Analysis LLM error: {e}")
        llm_analysis = {
            "summary": "Analysis failed — raw conversation stored.",
            "outcome": "UNKNOWN",
            "final_stage": session_data.get("current_stage", "UNKNOWN"),
            "metrics": {
                "turns": turn_count, "duration_minutes": duration_minutes,
                "images_shared": images_shared, "sql_queries_made": sql_queries,
                "stages_reached": stages_reached, "stage_progression": "unknown",
            },
            "customer_intent": "unknown", "products_discussed": [], "key_insights": [],
            "missed_opportunities": [], "sentiment_arc": "unknown",
            "recommended_followup": "Review conversation manually.",
        }

    record = {
        "session_id": session_id,
        "user_id": session_data.get("user_id") or session_id[:8],
        "shop_id": session_data.get("shop_id"),
        "shop_name": session_data.get("shopName"),
        "city": session_data.get("city"),
        "state": session_data.get("state"),
        "country": session_data.get("country"),
        "product_type": session_data.get("productType"),
        "started_at": chat_history[0].get("timestamp") if chat_history else datetime.now().isoformat(),
        "ended_at": datetime.now().isoformat(),
        "duration_minutes": duration_minutes,
        "turn_count": turn_count,
        "analysis": llm_analysis,
        "conversation": chat_history,
    }

    db_id = save_analysis_to_db(record)

    session_data["chat_history"] = []
    session_data["current_stage"] = "GREETING"
    logger.info(
        f"Analysis saved (db_id={db_id}) + session cleared | session={session_id[:8]} | "
        f"shop={record['shop_name']} | outcome={llm_analysis.get('outcome')} | turns={turn_count}"
    )

    return jsonify({
        "message": "Analysis complete and session cleared",
        "session_id": session_id,
        "db_id": db_id,
        "analysis": llm_analysis,
    }), 200


@app.route("/analyses", methods=["GET"])
def get_all_analyses():
    shop_id = request.args.get("shop_id")
    limit = int(request.args.get("limit", 100))
    rows = fetch_analyses_from_db(shop_id=shop_id, limit=limit)
    for r in rows:
        for col in ("products_discussed", "key_insights"):
            if isinstance(r.get(col), str):
                try:
                    r[col] = json.loads(r[col])
                except Exception:
                    r[col] = []
        for col in ("started_at", "ended_at", "created_at"):
            if r.get(col) and not isinstance(r[col], str):
                r[col] = r[col].isoformat()
    return jsonify({"total": len(rows), "analyses": rows}), 200


@app.route("/analyses/<session_id_or_id>", methods=["GET"])
def get_analysis_detail(session_id_or_id):
    import sqlalchemy
    try:
        try:
            row_id = int(session_id_or_id)
            sql = sqlalchemy.text("SELECT * FROM conversation_analyses WHERE id = :id")
            params = {"id": row_id}
        except ValueError:
            sql = sqlalchemy.text("SELECT * FROM conversation_analyses WHERE session_id = :sid")
            params = {"sid": session_id_or_id}

        with engine.connect() as conn:
            row = conn.execute(sql, params).fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404
            record = dict(row._mapping)
            for col in ("products_discussed", "key_insights", "missed_opportunities",
                        "stages_reached", "full_analysis", "conversation_transcript"):
                if isinstance(record.get(col), str):
                    try:
                        record[col] = json.loads(record[col])
                    except Exception:
                        pass
            for col in ("started_at", "ended_at", "created_at"):
                if record.get(col) and not isinstance(record[col], str):
                    record[col] = record[col].isoformat()
            return jsonify(record), 200
    except Exception as e:
        logger.error(f"get_analysis_detail error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/analyses/stats", methods=["GET"])
def get_analyses_stats():
    shop_id = request.args.get("shop_id")
    stats = fetch_analyses_stats_from_db(shop_id=shop_id)
    if not stats:
        return jsonify({"message": "No analyses yet"}), 200
    return jsonify(stats), 200


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ShopMate Conversational AI is running"}), 200

if __name__ == "__main__":
    logger.info("Starting ShopMate Conversational Retail Assistant (agentic tool-calling)")
    app.run(port=os.getenv("PORT_SERVER") or 3001, debug=True)