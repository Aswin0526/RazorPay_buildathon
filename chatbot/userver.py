from flask import Flask, request, jsonify
from datetime import timedelta, datetime
from flask_cors import CORS
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
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
import base64
import asyncio
import inspect
from typing import Optional, Dict, Tuple, List, TypedDict
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}"
    f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
)
MCP_TOOLBOX_URL = os.getenv("MCP_TOOLBOX_URL", "http://127.0.0.1:5005/mcp")
MCP_TOOLBOX_TOOLSET = os.getenv("MCP_TOOLBOX_TOOLSET", "shopmate")
MCP_TOOLBOX_SQL_TOOL = os.getenv("MCP_TOOLBOX_SQL_TOOL", "execute_sql")
MCP_TOOLBOX_TIMEOUT = float(os.getenv("MCP_TOOLBOX_TIMEOUT", "5"))
USE_MCP_TOOLBOX = os.getenv("USE_MCP_TOOLBOX", "true").lower() in {"1", "true", "yes", "on"}

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

HARDCODED_RESTRICTED_TABLES = [
    "customers", "orders", "order_items", "owners",
    "refresh_tokens", "wishlist", "users", "payments",
    "auth_tokens", "sessions", "admin"
]

_full_db = SQLDatabase(engine, sample_rows_in_table_info=0)

llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    google_api_key=GEMINI_API_KEY,
    temperature=0.3
)

vision_client = genai.Client(api_key=GEMINI_API_KEY)

def analyze_image(image_base64: str, image_context: str, shop_name: str, product_type: str) -> str:
    """
    Analyze an image using Gemini Vision.
    image_base64 : full data-URL (data:image/jpeg;base64,...) or raw base64
    image_context: what the bot asked the user for (e.g. "skin type analysis")
    Returns a plain-text analysis string injected into the orchestrator.
    """
    try:
        if "," in image_base64:
            header, raw_b64 = image_base64.split(",", 1)
            # Detect mime type from header  e.g. "data:image/png;base64"
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
            model="gemini-3.5-flash-lite",
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
# Security Layer —
# ─────────────────────────────────────────────

def get_all_db_tables() -> list[str]:
    """Get every public table and view that exists in the database, with retry."""
    import sqlalchemy
    for attempt in range(3):
        try:
            with engine.connect() as conn:
                tables = conn.execute(
                    sqlalchemy.text(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                    )
                ).fetchall()
                views = conn.execute(
                    sqlalchemy.text(
                        "SELECT viewname FROM pg_views WHERE schemaname = 'public'"
                    )
                ).fetchall()
                names = [row[0] for row in tables] + [row[0] for row in views]
                return sorted(set(names))
        except Exception as e:
            logger.warning(f"get_all_db_tables attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error("All retries exhausted for get_all_db_tables")
                return []


def get_view_schema(view_name: str) -> str:
    """Return a lightweight schema description for a PostgreSQL view."""
    import sqlalchemy

    with engine.connect() as conn:
        rows = conn.execute(
            sqlalchemy.text(
                "SELECT column_name, data_type "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :view_name "
                "ORDER BY ordinal_position"
            ),
            {"view_name": view_name},
        ).fetchall()

    if not rows:
        return f"View '{view_name}' not found in database."

    columns = ",\n".join(f"  {name} ({data_type})" for name, data_type in rows)
    return f"View public.{view_name} columns:\n{columns}"


def execute_sqlalchemy_query(sql: str) -> str:
    """Execute a validated SELECT and format rows without LangChain reflection."""
    import sqlalchemy

    with engine.connect() as conn:
        result = conn.execute(sqlalchemy.text(sql))
        rows = result.fetchall()
        if not rows:
            return ""

        headers = list(result.keys())
        values = [tuple(str(value) if value is not None else "" for value in row) for row in rows]
        return "\n".join([
            "| " + " | ".join(headers) + " |",
            "| " + " | ".join("---" for _ in headers) + " |",
            *["| " + " | ".join(row) + " |" for row in values],
        ])


def clean_sql(text: str) -> str:
    """Strip markdown fences from LLM SQL output."""
    text = text if isinstance(text, str) else text.get("query", "")
    cleaned = re.sub(r"```(?:sql|postgresql)?\s*([\s\S]*?)\s*```", r"\1", text).strip()
    return cleaned.rstrip(";").strip()


def extract_tables_from_sql(sql: str) -> list[str]:
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
            tool = toolset.get(tool_name)
            if tool is None:
                tool = next((v for k, v in toolset.items() if str(k).lower() == tool_name.lower()), None)
        elif isinstance(toolset, (list, tuple)):
            tool = next((t for t in toolset if str(getattr(t, "name", "")).lower() == tool_name.lower()), None)
        else:
            tool = toolset

        if tool is None:
            raise RuntimeError(f"MCP Toolbox tool '{tool_name}' was not found in toolset '{MCP_TOOLBOX_TOOLSET}'")

        for method_name in ("invoke", "call", "__call__"):
            method = getattr(tool, method_name, None)
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


def build_keyword_filters(field_name: str, keyword: str, include_phrase: bool = True) -> list[str]:
    """Build a forgiving keyword filter for product names using token-based matching."""
    if not keyword:
        return []

    normalized = re.sub(r"[^a-zA-Z0-9]+", " ", str(keyword)).strip()
    tokens = [t for t in normalized.lower().split() if len(t) >= 2]
    if not tokens:
        return []

    filters: list[str] = []
    if include_phrase:
        phrase = normalized.replace("'", "''").lower()
        if phrase:
            filters.append(f"LOWER({field_name}) LIKE LOWER('%{phrase}%')")

    for token in tokens:
        safe_token = token.replace("'", "''")
        filters.append(f"LOWER({field_name}) LIKE LOWER('%{safe_token}%')")

    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for f in filters:
        if f not in seen:
            seen.add(f)
            deduped.append(f)
    return deduped


def build_toolbox_sql_from_args(tool_name: str, tool_args: dict, allowed_table: str) -> str:
    """Create a safe SELECT query from a structured toolbox tool call. This keeps SQL generation on the server side, not in the model."""
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
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace("'", "''")}%')")
        where = f" WHERE {' OR '.join(filters)}" if filters else ""
        return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"

    if tool_name == "stock_check":
        filters = build_keyword_filters("product_name", keyword)
        if category:
            filters.append(f"LOWER(category) LIKE LOWER('%{category.replace("'", "''")}%')")
        if brand:
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace("'", "''")}%')")

        name_clause = " OR ".join(filters) if filters else "1=1"
        category_clause = f"LOWER(category) LIKE LOWER('%{category.replace("'", "''")}%')" if category else "1=1"
        brand_clause = f"LOWER(brand) LIKE LOWER('%{brand.replace("'", "''")}%')" if brand else "1=1"
        where = f" WHERE ({name_clause}) AND ({category_clause}) AND ({brand_clause})"
        return f"SELECT product_name, brand, category, stock, price FROM {safe_table}{where} LIMIT {limit};"

    if tool_name == "compare_products":
        if products:
            expr = " OR ".join([f"LOWER(product_name) LIKE LOWER('%{p.replace("'", "''")}%')" for p in products[:3]])
            return f"SELECT product_name, brand, category, price, stock FROM {safe_table} WHERE {expr} LIMIT {limit};"
        return f"SELECT product_name, brand, category, price, stock FROM {safe_table} WHERE category IS NOT NULL LIMIT {limit};"

    if tool_name == "price_lookup":
        filters = build_keyword_filters("product_name", keyword)
        if category:
            filters.append(f"LOWER(category) LIKE LOWER('%{category.replace("'", "''")}%')")
        if brand:
            filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace("'", "''")}%')")
        where = f" WHERE {' OR '.join(filters)}" if filters else ""
        return f"SELECT product_name, brand, price FROM {safe_table}{where} ORDER BY price LIMIT {limit};"

    if tool_name == "wishlist_search":
        kw = keyword or ""
        if not kw:
            return f"SELECT * FROM {safe_table} LIMIT {limit};"
        filters = build_keyword_filters("product_name", kw)
        if not filters:
            return f"SELECT * FROM {safe_table} LIMIT {limit};"
        where = " WHERE " + " OR ".join(filters)
        return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"

    # Default: generic product search
    filters = build_keyword_filters("product_name", keyword)
    if category:
        filters.append(f"LOWER(category) LIKE LOWER('%{category.replace("'", "''")}%')")
    if brand:
        filters.append(f"LOWER(brand) LIKE LOWER('%{brand.replace("'", "''")}%')")
    where = f" WHERE {' OR '.join(filters)}" if filters else ""
    return f"SELECT * FROM {safe_table}{where} LIMIT {limit};"


def execute_toolbox_tool(tool_name: str, tool_args: dict, allowed_table: str) -> str:
    """Execute a structured toolbox tool call using a server-side SQL builder and optional MCP Toolbox delegation."""
    tool_name = (tool_name or "search_products").strip()
    tool_args = tool_args or {}
    sql = build_toolbox_sql_from_args(tool_name, tool_args, allowed_table)
    logger.info(f"Executing toolbox tool '{tool_name}' with internal SQL: {sql[:180]}")
    return validate_and_execute_sql(sql, allowed_table)


def validate_and_execute_sql(sql: str, allowed_table: str) -> str:
    """Hard security gate: only allows SELECT on the session's assigned table."""
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

    if USE_MCP_TOOLBOX:
        boxed_result = execute_query_via_toolbox(sql)
        if boxed_result and not boxed_result.startswith("TOOLBOX_QUERY_ERROR") and boxed_result != "TOOLBOX_DISABLED":
            return boxed_result
        if boxed_result == "TOOLBOX_DISABLED":
            logger.info("MCP Toolbox is disabled; using direct SQL fallback")
        else:
            logger.warning("MCP Toolbox failed; falling back to direct SQL execution")

    for attempt in range(3):
        try:
            logger.info(f"EXECUTING (table={allowed_lower}): {sql}")
            if allowed_lower == "global_products_view":
                result = execute_sqlalchemy_query(sql)
            else:
                session_db = SQLDatabase(engine, include_tables=[allowed_lower], sample_rows_in_table_info=0)
                tool = QuerySQLDatabaseTool(db=session_db)
                result = tool.invoke(sql)
            logger.info(f"RESULT PREVIEW: {str(result)[:300]}")
            return result
        except Exception as e:
            logger.warning(f"SQL execute attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                return f"QUERY_ERROR: {str(e)}"


STAGES = {
    "GREETING":       "User just started or greeted",
    "BROWSING":       "User is exploring products / categories",
    "INTERESTED":     "User expressed interest in specific product(s)",
    "COMPARING":      "User wants to compare products",
    "DECIDING":       "User is close to making a decision",
    "CLOSING":        "User confirmed purchase intent",
    "SUPPORT":        "User has a question about warranty / policy / location",
    "AWAITING_IMAGE": "Bot asked user to upload an image — waiting for it"
}

TOOLBOX_TOOL_DEFINITIONS = {
    "search_products": {
        "description": "Search product inventory by keyword, brand, category, or name.",
        "args": ["keyword", "category", "brand", "limit"]
    },
    "list_categories": {
        "description": "List available product categories or subcategories in the shop.",
        "args": ["limit"]
    },
    "get_product_details": {
        "description": "Fetch the exact product details for a named product or model.",
        "args": ["product_name", "brand", "limit"]
    },
    "stock_check": {
        "description": "Check the stock/availability for a product or category.",
        "args": ["keyword", "category", "brand", "limit"]
    },
    "compare_products": {
        "description": "Compare two or more product variants side by side.",
        "args": ["product_names", "category", "limit"]
    },
    "price_lookup": {
        "description": "Retrieve product prices and price range information.",
        "args": ["keyword", "category", "brand", "limit"]
    },
    "wishlist_search": {
        "description": "Look up matching products for wishlist-style requests.",
        "args": ["keyword", "limit"]
    },
    "cart_search": {
        "description": "Look up matching products for cart or purchase-intent requests.",
        "args": ["keyword", "limit"]
    }
}

# ─────────────────────────────────────────────
# Prompts
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

## IMAGE ANALYSIS RESULT (if customer sent an image this turn)
{image_analysis}

## YOUR PERSONALITY
- Warm, knowledgeable, proactive salesperson
- You remember everything said earlier in the conversation
- You naturally guide users toward purchase decisions
- You compare products intelligently and make recommendations
- You highlight deals, warranties, and value propositions
- You NEVER break character or mention SQL/databases/AI

## SALES FLOW
GREETING → understand what they need
BROWSING → show options, ask clarifying questions
INTERESTED → go deeper on specific product(s), highlight features
COMPARING → compare 2-3 options side by side in plain language
DECIDING → address objections, reinforce value, nudge toward decision
CLOSING → confirm interest, mention next steps (visit store, call, etc.)
SUPPORT → answer policy/warranty/location questions
AWAITING_IMAGE → you already asked for an image, wait patiently

## WHEN TO REQUEST AN IMAGE
Ask the customer to share an image when it would meaningfully help you recommend products.
Examples:
- Cosmetics/skincare: ask for a selfie to identify skin type, tone, or concern
- Fashion: ask for a photo of an outfit they want to match
- Electronics: ask for a photo of a broken/old device for replacement suggestions
- Any product: ask for a photo if the customer struggles to describe what they want

When requesting an image, set "needs_image" to true and "image_context" to what they should photograph.
Set stage to "AWAITING_IMAGE".

## WHAT YOU MUST DO
1. Analyze user message + conversation history + image analysis (if any)
2. Decide the next conversation STAGE
3. If this needs product data, choose the most appropriate TOOLBOX TOOL, not raw SQL
4. Use one of the allowed toolbox tools below to answer the user's question
5. Formulate a warm, helpful, sales-oriented response

## TOOLBOX RULES (CRITICAL)
- Use ONLY the allowed tool names below
- DO NOT output raw SQL text in the JSON plan
- The tool call will be executed by the server using safe internal SQL generation
- ONLY query the table: {table_name}
- NEVER access restricted tables: customers, orders, owners, refresh_tokens, wishlist
- For text matching, provide keyword/brand/category arguments rather than writing SQL conditions

## AVAILABLE TOOLBOX TOOLS
- search_products: keyword, category, brand, limit
- list_categories: limit
- get_product_details: product_name, brand, limit
- stock_check: keyword, category, brand, limit
- compare_products: product_names, category, limit
- price_lookup: keyword, category, brand, limit
- wishlist_search: keyword, limit

## WISHLIST HANDLING
When the user asks to add something to their wishlist (e.g. "add MacBook to my wishlist", "save this", "wishlist it"):
- Set needs_wishlist to true
- Set wishlist_keyword to the product name/term they mentioned
- Set needs_sql to false and tool_name to "wishlist_search"
- Set tool_args accordingly
- Write a response_template confirming you will show matching products for them to pick

## CART / BUY FLOW HANDLING
When the user says they want to buy, checkout, proceed to buy, add to cart, or place an item in the cart:
- Set needs_cart to true
- Set cart_keyword to the product name/term they mentioned
- Set needs_sql to false
- Use a cart-oriented search, not raw SQL
- Respond with a short template that says you will show matching products for selection

## OUTPUT FORMAT — strict JSON only, no markdown, no extra text
{{
  "stage": "GREETING|BROWSING|INTERESTED|COMPARING|DECIDING|CLOSING|SUPPORT|AWAITING_IMAGE",
  "needs_sql": true|false,
  "tool_name": "search_products|list_categories|get_product_details|stock_check|compare_products|price_lookup|wishlist_search|cart_search|null",
  "tool_args": {{"keyword": "...", "category": "...", "brand": "...", "limit": 10}},
  "needs_image": true|false,
  "image_context": "what you are asking the customer to photograph (null if needs_image=false)",
  "needs_wishlist": true|false,
  "wishlist_keyword": "product name/term to search (null if needs_wishlist=false)",
  "needs_cart": true|false,
  "cart_keyword": "product name/term to search for cart flow (null if needs_cart=false)",
  "thinking": "brief internal reasoning",
  "response_template": "your response to the user (put [SQL_RESULTS] where DB data goes if needs_sql=true)"
}}
"""

RESPONSE_FORMATTER_PROMPT = """You are ShopMate, a warm retail assistant.
Shop: {shop_name} | Location: {city}, {state}

Plan:
- Thinking: {thinking}
- Stage: {stage}
- Template: {response_template}

SQL Results: {sql_results}
Image Analysis: {image_analysis}

Write the FINAL response to: "{user_message}"

## CRITICAL RULES — NEVER BREAK THESE:
1. ONLY use product data from SQL Results above. NEVER invent, assume, or recall products from your training data.
2. If SQL Results is empty, "[NO_RESULTS]", or contains no product rows — you MUST say the product is not available in this shop. Do NOT suggest products that are not in the SQL Results.
3. If SQL Results has data — use ONLY those exact products, prices, and details. Do not add extra products.
4. NEVER say things like "we have the MacBook Pro" unless that exact product appears in SQL Results.
5. If you are unsure whether a product exists in the shop — say you'll check and ask the customer to rephrase.

## FORMAT RULES:
- Natural, conversational language
- NO tables, NO pipe characters, NO asterisks
- Use numbered lists or "First... Second... Also..." style
- Highlight prices, features, availability from SQL data naturally
- If image was analyzed, reference what you saw to make it personal
- End with a helpful question or next step
- 2-5 sentences for simple answers, more for comparisons
"""



def extract_text_from_model_response(response) -> str:
    """Normalize LangChain/Gemini responses into plain text."""
    if response is None:
        return ""
    if isinstance(response, str):
        return response.strip()
    if isinstance(response, list):
        pieces = []
        for item in response:
            if isinstance(item, str):
                pieces.append(item)
            elif isinstance(item, dict):
                if "text" in item:
                    pieces.append(str(item["text"]))
                elif "content" in item:
                    pieces.append(extract_text_from_model_response(item["content"]))
                elif "parts" in item:
                    pieces.append(extract_text_from_model_response(item["parts"]))
            elif hasattr(item, "text"):
                pieces.append(str(item.text))
        return "\n".join(p for p in pieces if p).strip()
    if isinstance(response, dict):
        for key in ("text", "content"):
            if key in response:
                return extract_text_from_model_response(response[key])
        if "parts" in response:
            return extract_text_from_model_response(response["parts"])
        return str(response).strip()
    if hasattr(response, "text"):
        text = getattr(response, "text")
        return extract_text_from_model_response(text)
    return str(response).strip()


def is_empty_sql_result(result: str) -> bool:
    """
    Detect if a SQL result genuinely has no data rows.
    Handles: empty string, LangChain empty tuple string, whitespace-only, 
    error strings, single-bracket results.
    """
    if not result:
        return True
    r = result.strip()
    # LangChain returns these for empty queries
    empty_patterns = [
        "", "[]", "()", "None", "no results", "0 rows",
        "NO_QUERY", "[]\n", "(\n)"
    ]
    if r.lower() in [p.lower() for p in empty_patterns]:
        return True
    # LangChain tuple format with no data: just header line, no data lines
    lines = [l.strip() for l in r.split("\n") if l.strip()]
    if len(lines) == 0:
        return True
    # All lines are just separators or the result is only punctuation
    if all(set(l) <= set("-+|= ") for l in lines):
        return True
    return False


def search_products_for_wishlist(keyword: str, allowed_table: str, filters: Optional[dict] = None) -> list:
    """
    Search shop table or global view for products matching keyword.
    Returns a list of dicts: [{product_id, product_name, price, ...}]
    Uses safe parameterized query — NOT through LLM SQL gate.
    """
    import sqlalchemy
    try:
        filters = filters or {}
        allowed_name = (allowed_table or "").lower()
        existing = [t.lower() for t in get_all_db_tables()]
        if allowed_name not in existing:
            return []

        with engine.connect() as conn:
            col_result = conn.execute(sqlalchemy.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t AND table_schema = 'public' ORDER BY ordinal_position"
            ), {"t": allowed_name})
            columns = [r[0] for r in col_result]

        if not columns:
            return []

        id_col = next((c for c in columns if c.lower() in ("id", "product_id")), columns[0])
        name_col = next((c for c in columns if "name" in c.lower()), None)
        if not name_col:
            return []

        price_col = next((c for c in columns if "price" in c.lower()), None)
        brand_col = next((c for c in columns if "brand" in c.lower()), None)
        desc_col = next((c for c in columns if "desc" in c.lower()), None)
        qty_col = next((c for c in columns if "qty" in c.lower() or "quantity" in c.lower()), None)

        select_cols = [id_col, name_col]
        if price_col: select_cols.append(price_col)
        if brand_col: select_cols.append(brand_col)
        if desc_col: select_cols.append(desc_col)
        if qty_col: select_cols.append(qty_col)

        select_str = ", ".join(select_cols)
        safe_table = allowed_name.replace('"', '').replace("'", "")

        normalized = re.sub(r"[^a-zA-Z0-9]+", " ", str(keyword or "")).strip()
        tokens = [t for t in normalized.lower().split() if len(t) >= 2]
        if not tokens:
            return []

        clauses = [f"LOWER({name_col}) LIKE LOWER('%{t}%')" for t in tokens]
        where_clauses = clauses

        if allowed_name == "global_products_view":
            city = str(filters.get("city") or "").strip()
            state = str(filters.get("state") or "").strip()
            country = str(filters.get("country") or "").strip()
            if city:
                where_clauses.append(f"LOWER(shop_city) = LOWER('{city.replace("'", "''")}')")
            if state:
                where_clauses.append(f"LOWER(shop_state) = LOWER('{state.replace("'", "''")}')")
            if country:
                where_clauses.append(f"LOWER(shop_country) = LOWER('{country.replace("'", "''")}')")

        sql_text = f"SELECT {select_str} FROM {safe_table} WHERE {' OR '.join(where_clauses[:1]) if len(where_clauses) == 1 else ' AND '.join(where_clauses)} LIMIT 8"

        with engine.connect() as conn:
            rows = conn.execute(sqlalchemy.text(sql_text)).fetchall()

        results = []
        for row in rows:
            d = dict(zip(select_cols, row))
            quantity_value = d.get(qty_col) if qty_col else None
            results.append({
                "product_id": d.get(id_col),
                "product_name": d.get(name_col),
                "price": d.get(price_col) if price_col else None,
                "brand": d.get(brand_col) if brand_col else None,
                "description": str(d.get(desc_col, ""))[:100] if desc_col else None,
                "quantity": int(quantity_value) if quantity_value is not None else 1,
            })
        logger.info(f"Wishlist search '{keyword}' on {safe_table}: {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"search_products_for_wishlist error: {e}")
        return []

# ─────────────────────────────────────────────
# LangGraph + Gemini + MCP-like Toolbox Agent
# ─────────────────────────────────────────────
class RetailAgentState(TypedDict):
    session: Dict
    user_message: str
    image_base64: Optional[str]
    plan: Dict
    image_analysis: str
    sql_results: str
    wishlist_products: List[Dict]
    cart_products: List[Dict]
    final_text: str


class LangGraphRetailAgent:
    """Agentic retail assistant using LangGraph state transitions, Gemini, and MCP-style tools."""

    def __init__(self, session_data: dict):
        self.session = session_data
        self.graph = self.build_graph()

    @property
    def table_name(self) -> str:
        if self.session.get("global_chat"):
            return "global_products_view"
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
                    return f"Table/view '{allowed}' not found in database."
                scoped_db = SQLDatabase(engine, include_tables=[allowed], sample_rows_in_table_info=2)
                return scoped_db.get_table_info()
            except Exception as e:
                logger.warning(f"get_scoped_schema attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
                else:
                    return f"Could not retrieve schema for table/view '{allowed}'."

    def build_toolbox(self):
        allowed_table = self.table_name

        @tool("inventory_query")
        def inventory_query(query: str) -> str:
            """Run a safe inventory lookup for the current shop and product table."""
            return validate_and_execute_sql(query, allowed_table)

        @tool("wishlist_search")
        def wishlist_search(keyword: str) -> str:
            """Find matching products for a wishlist-style product search."""
            return json.dumps(search_products_for_wishlist(keyword, allowed_table))

        @tool("image_analysis")
        def image_analysis_tool(image_base64: str, image_context: str) -> str:
            """Analyze a customer-uploaded image for product and style guidance."""
            return analyze_image(
                image_base64,
                image_context,
                self.session.get("shopName", "Our Shop"),
                self.session.get("productType", "products")
            )

        return [inventory_query, wishlist_search, image_analysis_tool]

    def build_graph(self):
        def plan_node(state: RetailAgentState):
            allowed_table = self.table_name
            scoped_schema = self.get_scoped_schema()
            image_analysis = ""
            if state.get("image_base64"):
                last = self.session.get("chat_history", [])
                image_context_used = (
                    last[-1].get("image_context", "general product identification")
                    if last else "general product identification"
                )
                logger.info(f"Analyzing image in context: {image_context_used}")
                image_analysis = analyze_image(
                    state["image_base64"],
                    image_context_used,
                    self.session.get("shopName", "Our Shop"),
                    self.session.get("productType", "products")
                )

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
                history=self.history_text,
                image_analysis=image_analysis if image_analysis else "(No image provided this turn)"
            )

            plan_response = llm.invoke([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": state["user_message"]}
            ])
            plan_text = extract_text_from_model_response(plan_response.content)
            plan = self._parse_plan(plan_text)
            logger.info(
                f"Plan → stage={plan.get('stage')}, needs_sql={plan.get('needs_sql')}, "
                f"needs_image={plan.get('needs_image')}, thinking={plan.get('thinking', '')[:80]}"
            )
            return {
                **state,
                "plan": plan,
                "image_analysis": image_analysis
            }

        def tool_node(state: RetailAgentState):
            plan = state["plan"]
            sql_results = ""
            wishlist_products = []
            cart_products = []
            sql_was_empty = False

            if plan.get("tool_name"):
                tool_name = str(plan.get("tool_name"))
                tool_args = plan.get("tool_args") or {}
                sql_results = execute_toolbox_tool(tool_name, tool_args, self.table_name)
                if sql_results.startswith("BLOCKED") or sql_results.startswith("TABLE_NOT_FOUND"):
                    logger.warning(f"Toolbox call blocked: {sql_results}")
                    sql_results = "[NO_RESULTS: Data access blocked]"
                    sql_was_empty = True
                elif sql_results.startswith("QUERY_ERROR"):
                    logger.error(f"Toolbox query error: {sql_results}")
                    sql_results = "[NO_RESULTS: Query failed]"
                    sql_was_empty = True
                elif is_empty_sql_result(sql_results):
                    logger.info("Toolbox returned empty result — flagging for honest response")
                    sql_results = "[NO_RESULTS: This product or category was not found in this shop's inventory]"
                    sql_was_empty = True
                else:
                    logger.info(f"Toolbox returned data: {sql_results[:120]}")
            elif plan.get("needs_sql") and plan.get("sql_query"):
                sql_results = validate_and_execute_sql(plan["sql_query"], self.table_name)
                if sql_results.startswith("BLOCKED") or sql_results.startswith("TABLE_NOT_FOUND"):
                    logger.warning(f"SQL blocked: {sql_results}")
                    sql_results = "[NO_RESULTS: Data access blocked]"
                    sql_was_empty = True
                elif sql_results.startswith("QUERY_ERROR"):
                    logger.error(f"SQL error: {sql_results}")
                    sql_results = "[NO_RESULTS: Query failed]"
                    sql_was_empty = True
                elif is_empty_sql_result(sql_results):
                    logger.info("SQL returned empty result — flagging for honest response")
                    sql_results = "[NO_RESULTS: This product or category was not found in this shop's inventory]"
                    sql_was_empty = True
                else:
                    logger.info(f"SQL returned data: {sql_results[:120]}")

            if plan.get("needs_wishlist") and plan.get("wishlist_keyword"):
                keyword = plan["wishlist_keyword"]
                wishlist_products = search_products_for_wishlist(
                    keyword,
                    self.table_name,
                    {
                        "city": self.session.get("city"),
                        "state": self.session.get("state"),
                        "country": self.session.get("country")
                    }
                )
                logger.info(f"Wishlist intent detected: keyword='{keyword}', found={len(wishlist_products)}")

            if plan.get("needs_cart") and plan.get("cart_keyword"):
                keyword = plan["cart_keyword"]
                cart_products = search_products_for_wishlist(
                    keyword,
                    self.table_name,
                    {
                        "city": self.session.get("city"),
                        "state": self.session.get("state"),
                        "country": self.session.get("country")
                    }
                )
                logger.info(f"Cart intent detected: keyword='{keyword}', found={len(cart_products)}")

            state["sql_results"] = sql_results
            state["wishlist_products"] = wishlist_products
            state["cart_products"] = cart_products
            state["sql_was_empty"] = sql_was_empty
            return state

        def response_node(state: RetailAgentState):
            plan = state["plan"]
            sql_results = state.get("sql_results", "")
            sql_was_empty = state.get("sql_was_empty", False)
            empty_guard = (
                "IMPORTANT: The database returned NO results for this query. "
                "You MUST tell the customer this product is not available in this shop. "
                "Do NOT mention or suggest any specific product names, models, or prices. "
                "Only offer to help them find something else that IS in stock.\n\n"
                if sql_was_empty else ""
            )

            formatter_prompt = empty_guard + RESPONSE_FORMATTER_PROMPT.format(
                shop_name=self.session.get("shopName", "Our Shop"),
                city=self.session.get("city", ""),
                state=self.session.get("state", ""),
                response_template=plan.get("response_template", ""),
                thinking=plan.get("thinking", ""),
                stage=plan.get("stage", "BROWSING"),
                sql_results=sql_results if sql_results else "No DB query needed.",
                image_analysis=state.get("image_analysis") if state.get("image_analysis") else "No image this turn.",
                user_message=state["user_message"]
            )

            final = llm.invoke([{"role": "user", "content": formatter_prompt}])
            return {**state, "final_text": extract_text_from_model_response(final.content)}

        graph = StateGraph(RetailAgentState)
        graph.add_node("plan", plan_node)
        graph.add_node("tool", tool_node)
        graph.add_node("respond", response_node)
        graph.set_entry_point("plan")
        graph.add_edge("plan", "tool")
        graph.add_edge("tool", "respond")
        graph.add_edge("respond", END)
        return graph.compile()

    def orchestrate(self, user_message: str, image_base64: Optional[str] = None) -> dict:
        state = {
            "session": self.session,
            "user_message": user_message,
            "image_base64": image_base64,
            "plan": {},
            "image_analysis": "",
            "sql_results": "",
            "wishlist_products": [],
            "cart_products": [],
            "final_text": ""
        }

        result = self.graph.invoke(state)

        plan = result.get("plan", {})
        response_text = result.get("final_text", "")
        wishlist_products = result.get("wishlist_products", [])
        cart_products = result.get("cart_products", [])

        self.session["chat_history"].append({
            "role": "user",
            "content": user_message,
            "response": response_text,
            "stage": plan.get("stage", "BROWSING"),
            "had_sql": bool(result.get("sql_results")),
            "had_image": bool(image_base64),
            "image_context": plan.get("image_context") or (self.session.get("chat_history", [])[-1].get("image_context", "") if self.session.get("chat_history") else ""),
            "timestamp": datetime.now().isoformat()
        })
        self.session["current_stage"] = plan.get("stage", "BROWSING")

        return {
            "text": response_text,
            "needs_image": bool(plan.get("needs_image")),
            "image_context": plan.get("image_context") or None,
            "needs_wishlist": bool(plan.get("needs_wishlist")),
            "wishlist_keyword": plan.get("wishlist_keyword") or None,
            "wishlist_products": wishlist_products,
            "needs_cart": bool(plan.get("needs_cart")),
            "cart_keyword": plan.get("cart_keyword") or None,
            "cart_products": cart_products,
            "show_cart": bool(plan.get("needs_cart") and cart_products),
            "should_speak": not bool(plan.get("needs_wishlist") or plan.get("needs_cart"))
        }

    def _parse_plan(self, content: str) -> dict:
        try:
            clean = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", content).strip()
            parsed = json.loads(clean)
            if not isinstance(parsed, dict):
                raise ValueError("Plan is not a JSON object")
            parsed.setdefault("needs_sql", bool(parsed.get("tool_name")))
            parsed.setdefault("tool_name", None)
            parsed.setdefault("tool_args", {})
            parsed.setdefault("needs_wishlist", False)
            parsed.setdefault("wishlist_keyword", None)
            parsed.setdefault("needs_cart", False)
            parsed.setdefault("cart_keyword", None)
            return parsed
        except Exception:
            logger.warning("Failed to parse plan JSON — using fallback")
            return {
                "stage": self.current_stage,
                "needs_sql": False,
                "sql_query": None,
                "tool_name": None,
                "tool_args": {},
                "needs_image": False,
                "image_context": None,
                "needs_wishlist": False,
                "wishlist_keyword": None,
                "needs_cart": False,
                "cart_keyword": None,
                "thinking": "JSON parse failed",
                "response_template": content
            }


# ─────────────────────────────────────────────
# Conversational Agent
# ─────────────────────────────────────────────
class ConversationalAgent:
    """Manages a full conversational retail session — strictly scoped to one table."""

    def __init__(self, session_data: dict):
        self.session = session_data

    @property
    def table_name(self) -> str:
        pt  = (self.session.get("productType") or "products").lower().strip().replace(" ", "_")
        sid = str(self.session.get("shop_id") or "0")
        sn  = (self.session.get("shopName") or "shop").lower().strip().replace(" ", "_")
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
        """Return schema for ONLY the session's assigned table."""
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

    def orchestrate(self, user_message: str, image_base64: Optional[str] = None) -> dict:
        """
        Main entry point.
        Returns dict: { "text": str, "needs_image": bool, "image_context": str|None }
        """
        allowed_table  = self.table_name
        scoped_schema  = self.get_scoped_schema()

        # ── Step 1: Analyze image if provided ───────────────────────────
        image_analysis = ""
        image_context_used = ""

        if image_base64:
            # Determine context: what did the bot ask for?
            last = self.session.get("chat_history", [])
            image_context_used = (
                last[-1].get("image_context", "general product identification")
                if last else "general product identification"
            )
            logger.info(f"Analyzing image in context: {image_context_used}")
            image_analysis = analyze_image(
                image_base64,
                image_context_used,
                self.session.get("shopName", "Our Shop"),
                self.session.get("productType", "products")
            )

        # ── Step 2: LLM plans the response ──────────────────────────────
        system_prompt = ORCHESTRATOR_SYSTEM.format(
            shop_name    = self.session.get("shopName", "Our Shop"),
            city         = self.session.get("city", ""),
            state        = self.session.get("state", ""),
            country      = self.session.get("country", ""),
            product_type = self.session.get("productType", "all products"),
            shop_id      = self.session.get("shop_id", ""),
            table_name   = allowed_table,
            db_schema    = scoped_schema,
            stage        = self.current_stage,
            history      = self.history_text,
            image_analysis = image_analysis if image_analysis else "(No image provided this turn)"
        )

        plan_response = llm.invoke([
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message}
        ])

        plan_text = extract_text_from_model_response(plan_response.content)
        plan = self._parse_plan(plan_text)
        logger.info(
            f"Plan → stage={plan.get('stage')}, "
            f"needs_sql={plan.get('needs_sql')}, "
            f"needs_image={plan.get('needs_image')}, "
            f"thinking={plan.get('thinking','')[:80]}"
        )

        # ── Step 3: Execute SQL through security gate ────────────────────
        sql_results = ""
        sql_was_empty = False

        if plan.get("needs_sql") and plan.get("sql_query"):
            sql_results = validate_and_execute_sql(plan["sql_query"], allowed_table)
            if sql_results.startswith("BLOCKED") or sql_results.startswith("TABLE_NOT_FOUND"):
                logger.warning(f"SQL blocked: {sql_results}")
                sql_results = "[NO_RESULTS: Data access blocked]"
                sql_was_empty = True
            elif sql_results.startswith("QUERY_ERROR"):
                logger.error(f"SQL error: {sql_results}")
                sql_results = "[NO_RESULTS: Query failed]"
                sql_was_empty = True
            elif is_empty_sql_result(sql_results):
                logger.info("SQL returned empty result — flagging for honest response")
                sql_results = "[NO_RESULTS: This product or category was not found in this shop's inventory]"
                sql_was_empty = True
            else:
                logger.info(f"SQL returned data: {sql_results[:120]}")

        # ── Step 3b: Wishlist product search (controlled, not LLM SQL gate) ───
        wishlist_products = []
        if plan.get("needs_wishlist") and plan.get("wishlist_keyword"):
            keyword = plan["wishlist_keyword"]
            wishlist_products = search_products_for_wishlist(keyword, allowed_table)
            logger.info(f"Wishlist intent detected: keyword='{keyword}', found={len(wishlist_products)}")

        # ── Step 4: Format final conversational response ─────────────────
        # If SQL was empty, prepend a hard instruction so LLM cannot hallucinate
        empty_guard = (
            "IMPORTANT: The database returned NO results for this query. "
            "You MUST tell the customer this product is not available in this shop. "
            "Do NOT mention or suggest any specific product names, models, or prices. "
            "Only offer to help them find something else that IS in stock.\n\n"
            if sql_was_empty else ""
        )

        formatter_prompt = empty_guard + RESPONSE_FORMATTER_PROMPT.format(
            shop_name      = self.session.get("shopName", "Our Shop"),
            city           = self.session.get("city", ""),
            state          = self.session.get("state", ""),
            response_template = plan.get("response_template", ""),
            thinking       = plan.get("thinking", ""),
            stage          = plan.get("stage", "BROWSING"),
            sql_results    = sql_results if sql_results else "No DB query needed.",
            image_analysis = image_analysis if image_analysis else "No image this turn.",
            user_message   = user_message
        )

        final        = llm.invoke([{"role": "user", "content": formatter_prompt}])
        response_text = extract_text_from_model_response(final.content)

        # ── Step 5: Persist to history ───────────────────────────────────
        self.session["chat_history"].append({
            "role":          "user",
            "content":       user_message,
            "response":      response_text,
            "stage":         plan.get("stage", "BROWSING"),
            "had_sql":       bool(sql_results),
            "had_image":     bool(image_base64),
            "image_context": plan.get("image_context") or image_context_used,
            "timestamp":     datetime.now().isoformat()
        })
        self.session["current_stage"] = plan.get("stage", "BROWSING")

        return {
            "text":             response_text,
            "needs_image":      bool(plan.get("needs_image")),
            "image_context":    plan.get("image_context") or None,
            "needs_wishlist":   bool(plan.get("needs_wishlist")),
            "wishlist_keyword": plan.get("wishlist_keyword") or None,
            "wishlist_products": wishlist_products
        }

    def _parse_plan(self, content: str) -> dict:
        try:
            clean = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", content).strip()
            return json.loads(clean)
        except json.JSONDecodeError:
            logger.warning("Failed to parse plan JSON — using fallback")
            return {
                "stage":             self.current_stage,
                "needs_sql":         False,
                "sql_query":         None,
                "needs_image":       False,
                "image_context":     None,
                "thinking":          "JSON parse failed",
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
SESSION_TIMEOUT    = 3600

_last_request_time      = datetime.min
_last_request_text_hash: Optional[str] = None
chat_sessions: Dict[str, Dict] = {}

# ─────────────────────────────────────────────
# Conversation Analysis — DB persistence
# ─────────────────────────────────────────────

def save_analysis_to_db(record: dict) -> Optional[int]:
    """
    Insert one conversation analysis record into conversation_analyses table.
    Returns the new row id, or None on failure.
    """
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
    a       = record.get("analysis", {})

    params = {
        "session_id":             record.get("session_id"),
        "user_id":                record.get("user_id"),
        "shop_id":                str(record.get("shop_id", "")),
        "shop_name":              record.get("shop_name"),
        "city":                   record.get("city"),
        "state":                  record.get("state"),
        "country":                record.get("country"),
        "product_type":           record.get("product_type"),
        "started_at":             record.get("started_at"),
        "ended_at":               record.get("ended_at"),
        "duration_minutes":       record.get("duration_minutes", 0),
        "turn_count":             record.get("turn_count", 0),
        "outcome":                a.get("outcome", "UNKNOWN"),
        "final_stage":            a.get("final_stage", "UNKNOWN"),
        "summary":                a.get("summary", ""),
        "customer_intent":        a.get("customer_intent", ""),
        "sentiment_arc":          a.get("sentiment_arc", ""),
        "stage_progression":      metrics.get("stage_progression", ""),
        "products_discussed":     json.dumps(a.get("products_discussed", [])),
        "key_insights":           json.dumps(a.get("key_insights", [])),
        "missed_opportunities":   json.dumps(a.get("missed_opportunities", [])),
        "recommended_followup":   a.get("recommended_followup", ""),
        "images_shared":          metrics.get("images_shared", 0),
        "sql_queries_made":       metrics.get("sql_queries_made", 0),
        "stages_reached":         json.dumps(metrics.get("stages_reached", [])),
        "full_analysis":          json.dumps(a),
        "conversation_transcript":json.dumps(record.get("conversation", []))
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
    """Fetch analyses from DB, optionally filtered by shop_id."""
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
    """Aggregate stats directly from DB."""
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
                "outcome_breakdown": outcomes
            }
    except Exception as e:
        logger.error(f"fetch_analyses_stats_from_db error: {e}")
        return {}




def is_rate_limited(text: str) -> bool:
    global _last_request_time, _last_request_text_hash
    current_time = datetime.now()
    text_hash    = hashlib.md5(text.encode()).hexdigest()
    time_diff    = (current_time - _last_request_time).total_seconds()
    if time_diff < RATE_LIMIT_SECONDS:
        return True
    if text_hash == _last_request_text_hash:
        return True
    _last_request_time      = current_time
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
            "chat_history":  [],
            "shopName":      None,
            "city":          None,
            "state":         None,
            "country":       None,
            "productType":   None,
            "shop_id":       None,
            "current_stage": "GREETING",
            "cart_items":    [],
            "last_active":   time.time()
        }
    else:
        chat_sessions[session_id]["last_active"] = time.time()

    return chat_sessions[session_id], session_id


# ─────────────────────────────────────────────
# Cart session helpers
# ─────────────────────────────────────────────

def get_cart_for_session(session_data: Dict) -> list:
    cart_items = session_data.get("cart_items", [])
    return cart_items if isinstance(cart_items, list) else []


@app.route("/cart", methods=["GET"])
def get_cart_items():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404
    return jsonify({
        "session_id": session_id,
        "cart_items": get_cart_for_session(session_data)
    }), 200


@app.route("/cart/add", methods=["POST"])
def add_cart_item():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404

    payload = request.get_json(silent=True) or {}
    quantity = payload.get("quantity")
    try:
        quantity = int(quantity) if quantity is not None else 1
    except (TypeError, ValueError):
        quantity = 1

    product = {
        "product_id": payload.get("product_id"),
        "product_name": payload.get("product_name") or "Product",
        "price": payload.get("price"),
        "brand": payload.get("brand"),
        "description": payload.get("description"),
        "category": payload.get("category"),
        "quantity": max(1, quantity)
    }

    if not product["product_name"] or not product["product_id"]:
        return jsonify({"error": "product_id and product_name are required"}), 400

    cart_items = get_cart_for_session(session_data)
    for item in cart_items:
        if str(item.get("product_id")) == str(product["product_id"]):
            item["quantity"] = int(item.get("quantity", 1)) + int(product["quantity"])
            item["price"] = item.get("price") if item.get("price") is not None else product.get("price")
            item["brand"] = item.get("brand") or product.get("brand")
            item["description"] = item.get("description") or product.get("description")
            item["category"] = item.get("category") or product.get("category")
            session_data["cart_items"] = cart_items
            return jsonify({
                "session_id": session_id,
                "message": "Cart quantity updated",
                "cart_items": cart_items,
                "should_speak": False
            }), 200

    cart_items.append(product)
    session_data["cart_items"] = cart_items

    return jsonify({
        "session_id": session_id,
        "message": "Product added to cart",
        "cart_items": cart_items,
        "should_speak": False
    }), 200


@app.route("/cart/remove", methods=["POST"])
def remove_cart_item():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404

    payload = request.get_json(silent=True) or {}
    product_id = payload.get("product_id")
    cart_items = get_cart_for_session(session_data)
    filtered = [item for item in cart_items if str(item.get("product_id")) != str(product_id)]
    session_data["cart_items"] = filtered

    return jsonify({
        "session_id": session_id,
        "message": "Product removed from cart",
        "cart_items": filtered,
        "should_speak": False
    }), 200


@app.route("/cart/clear", methods=["POST"])
def clear_cart_items():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404

    session_data["cart_items"] = []
    return jsonify({
        "session_id": session_id,
        "message": "Cart cleared",
        "cart_items": [],
        "should_speak": False
    }), 200


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
    is_global_chat = bool(form_data.get("globalChat") or form_data.get("global_chat") or form_data.get("mode") == "global")

    session_data.update({
        "shopName":      form_data.get("shopName") or ("Global Marketplace" if is_global_chat else None),
        "city":          form_data.get("city"),
        "state":         form_data.get("state"),
        "country":       form_data.get("country"),
        "productType":   form_data.get("productType") or ("all products" if is_global_chat else "products"),
        "shop_id":       form_data.get("shopId"),
        "global_chat":   is_global_chat,
        "chat_history":  [],
        "current_stage": "GREETING"
    })

    shop_name    = session_data.get("shopName") or ("Global Marketplace" if is_global_chat else "the store")
    product_type = session_data.get("productType") or ("all products" if is_global_chat else "products")
    city         = session_data.get("city", "")

    welcome_prompt = (
        f"You are ShopMate, a retail assistant for '{shop_name}' in {city} "
        f"specializing in {product_type}. "
        if not is_global_chat else
        f"You are ShopMate, a platform-wide retail assistant helping customers explore products across shops in {city}, {session_data.get('state')}, {session_data.get('country')}. "
        f"Give a warm, brief (2-3 sentences) welcome message: "
        f"1) Greet warmly, 2) Mention the location and that you can search across available shops, "
        f"3) Ask what they're looking for. Be natural, not robotic."
    )

    welcome_llm = llm.invoke([{
        "role": "user",
        "content": welcome_prompt
    }])
    welcome_message = extract_text_from_model_response(welcome_llm.content)
    logger.info(f"Session started: {shop_name} in {city}")

    return jsonify({
        "message":    "Chat session started",
        "session_id": returned_session_id,
        "welcome":    welcome_message,
        "shop":       shop_name,
        "location":   f"{city}, {session_data.get('state')}, {session_data.get('country')}",
        "global_chat": is_global_chat,
        "mode": "global" if is_global_chat else "shop"
    }), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json(silent=True) or {}
    session_id = (
        request.headers.get('X-Session-ID') or
        request.args.get('session_id') or
        data.get('session_id')
    )

    if not data and not session_id:
        return jsonify({"error": "No data received"}), 400

    text = (data.get("text", "") or "").strip()
    image_b64 = data.get("image") or None

    if not text:
        return jsonify({"error": "Empty message"}), 400

    if is_rate_limited(text):
        return jsonify({
            "error":   "Rate limited",
            "message": "Please wait a moment before sending another message"
        }), 429

    session_data, session_id = get_session_data(session_id)
    if session_data is None or not session_data.get("shopName"):
        return jsonify({
            "error":   "No active session",
            "message": "Please call /start-chat first to initialize your session."
        }), 400

    has_image = bool(image_b64)
    logger.info(f"[{session_id[:8]}] User: {text} {'[+IMAGE]' if has_image else ''}")

    agent  = LangGraphRetailAgent(session_data)
    result = agent.orchestrate(text, image_b64)

    logger.info(
        f"[{session_id[:8]}] Stage: {session_data.get('current_stage')} | "
        f"needs_image={result['needs_image']} | "
        f"Response: {result['text'][:100]}..."
    )

    return jsonify({
        "text":              result["text"],
        "needs_image":       result["needs_image"],
        "image_context":     result["image_context"],
        "needs_wishlist":    result.get("needs_wishlist", False),
        "wishlist_keyword":  result.get("wishlist_keyword"),
        "wishlist_products": result.get("wishlist_products", []),
        "needs_cart":        result.get("needs_cart", False),
        "cart_keyword":      result.get("cart_keyword"),
        "cart_products":     result.get("cart_products", []),
        "show_cart":         result.get("show_cart", False),
        "should_speak":      result.get("should_speak", True),
        "stage":             session_data.get("current_stage", "BROWSING"),
        "session_id":        session_id
    }), 200


@app.route("/chat-history", methods=["GET"])
def get_chat_history():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404
    history = session_data.get("chat_history", [])
    return jsonify({
        "session_id":   session_id,
        "stage":        session_data.get("current_stage"),
        "chat_history": history,
        "count":        len(history)
    }), 200


@app.route("/clear-chat", methods=["POST"])
def clear_chat():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    session_data["chat_history"]  = []
    session_data["current_stage"] = "GREETING"
    return jsonify({"message": "Chat cleared and reset to GREETING stage"}), 200


@app.route("/get-session", methods=["GET"])
def get_session():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    return jsonify({
        "session_id":         session_id,
        "shopName":           session_data.get("shopName"),
        "city":               session_data.get("city"),
        "state":              session_data.get("state"),
        "country":            session_data.get("country"),
        "productType":        session_data.get("productType"),
        "shop_id":            session_data.get("shop_id"),
        "current_stage":      session_data.get("current_stage"),
        "chat_history_count": len(session_data.get("chat_history", [])),
        "active_sessions":    len(chat_sessions)
    }), 200


@app.route("/sessions/status", methods=["GET"])
def sessions_status():
    return jsonify({
        "total_sessions": len(chat_sessions),
        "sessions": {
            sid[:8] + "...": {
                "shop":          data.get("shopName"),
                "city":          data.get("city"),
                "stage":         data.get("current_stage"),
                "history_count": len(data.get("chat_history", [])),
                "last_active":   datetime.fromtimestamp(data.get("last_active", 0)).isoformat()
            }
            for sid, data in chat_sessions.items()
        }
    }), 200


@app.route("/cleanup-sessions", methods=["POST"])
def cleanup_sessions_route():
    count = cleanup_old_sessions()
    return jsonify({"cleaned": count, "remaining": len(chat_sessions)}), 200


@app.route("/transcribe/status", methods=["GET"])
def transcribe_status():
    global _last_request_time
    current_time = datetime.now()
    time_diff    = (current_time - _last_request_time).total_seconds()
    return jsonify({
        "rate_limited":     time_diff < RATE_LIMIT_SECONDS,
        "cooldown_seconds": max(0, RATE_LIMIT_SECONDS - time_diff)
    }), 200


@app.route("/debug/table", methods=["GET"])
def debug_table():
    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({"error": "No active session"}), 400
    agent    = LangGraphRetailAgent(session_data)
    table    = agent.table_name
    existing = get_all_db_tables()
    exists   = table.lower() in [t.lower() for t in existing]
    return jsonify({
        "session_id":        session_id,
        "assigned_table":    table,
        "table_exists_in_db": exists,
        "schema_preview":    agent.get_scoped_schema() if exists else "Table not found",
        "all_db_tables_count": len(existing)
    }), 200



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
    """
    Called when user closes the voice UI.
    Generates a full conversation analysis and stores it in the global list.
    """
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404

    chat_history = session_data.get("chat_history", [])
    if not chat_history:
        return jsonify({"message": "No conversation to analyze", "analysis": None}), 200

    # ── Build conversation text ──────────────────────────────────────────
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

    # ── Calculate metrics ────────────────────────────────────────────────
    turn_count      = len(chat_history)
    images_shared   = sum(1 for m in chat_history if m.get("had_image"))
    sql_queries     = sum(1 for m in chat_history if m.get("had_sql"))
    stages_reached  = list(dict.fromkeys([m.get("stage", "UNKNOWN") for m in chat_history]))

    # Duration from first to last message
    try:
        t_first = datetime.fromisoformat(chat_history[0].get("timestamp", datetime.now().isoformat()))
        t_last  = datetime.fromisoformat(chat_history[-1].get("timestamp", datetime.now().isoformat()))
        duration_minutes = round((t_last - t_first).total_seconds() / 60, 1)
    except Exception:
        duration_minutes = 0

    # ── Call LLM for analysis ────────────────────────────────────────────
    try:
        prompt = ANALYSIS_PROMPT.format(
            shop_name        = session_data.get("shopName", "Unknown"),
            shop_id          = session_data.get("shop_id", "Unknown"),
            city             = session_data.get("city", ""),
            state            = session_data.get("state", ""),
            country          = session_data.get("country", ""),
            product_type     = session_data.get("productType", ""),
            session_id       = session_id,
            duration_minutes = duration_minutes,
            turn_count       = turn_count,
            images_shared    = images_shared,
            sql_queries      = sql_queries,
            conversation_text= conversation_text
        )

        response     = llm.invoke([{"role": "user", "content": prompt}])
        raw          = extract_text_from_model_response(response.content)
        clean        = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", raw).strip()
        llm_analysis = json.loads(clean)

        # Patch stages_reached from actual data (LLM sometimes hallucinates)
        llm_analysis["metrics"]["stages_reached"] = stages_reached

    except Exception as e:
        logger.error(f"Analysis LLM error: {e}")
        llm_analysis = {
            "summary": "Analysis failed — raw conversation stored.",
            "outcome": "UNKNOWN",
            "final_stage": session_data.get("current_stage", "UNKNOWN"),
            "metrics": {
                "turns": turn_count,
                "duration_minutes": duration_minutes,
                "images_shared": images_shared,
                "sql_queries_made": sql_queries,
                "stages_reached": stages_reached,
                "stage_progression": "unknown"
            },
            "customer_intent": "unknown",
            "products_discussed": [],
            "key_insights": [],
            "missed_opportunities": [],
            "sentiment_arc": "unknown",
            "recommended_followup": "Review conversation manually."
        }

    # ── Build full record ────────────────────────────────────────────────
    record = {
        "session_id":    session_id,
        "user_id":       session_data.get("user_id") or session_id[:8],
        "shop_id":       session_data.get("shop_id"),
        "shop_name":     session_data.get("shopName"),
        "city":          session_data.get("city"),
        "state":         session_data.get("state"),
        "country":       session_data.get("country"),
        "product_type":  session_data.get("productType"),
        "started_at":    chat_history[0].get("timestamp") if chat_history else datetime.now().isoformat(),
        "ended_at":      datetime.now().isoformat(),
        "duration_minutes": duration_minutes,
        "turn_count":    turn_count,
        "analysis":      llm_analysis,
        "conversation":  chat_history   # full transcript attached
    }

    # ── Save to database ────────────────────────────────────────────────
    db_id = save_analysis_to_db(record)

    # ── Clear session after saving ───────────────────────────────────────
    session_data["chat_history"]  = []
    session_data["current_stage"] = "GREETING"
    logger.info(
        f"Analysis saved (db_id={db_id}) + session cleared | "
        f"session={session_id[:8]} | shop={record['shop_name']} | "
        f"outcome={llm_analysis.get('outcome')} | turns={turn_count}"
    )

    return jsonify({
        "message":    "Analysis complete and session cleared",
        "session_id": session_id,
        "db_id":      db_id,
        "analysis":   llm_analysis
    }), 200


@app.route("/analyses", methods=["GET"])
def get_all_analyses():
    """Return analyses from DB, optionally filtered by shop_id."""
    shop_id = request.args.get("shop_id")
    limit   = int(request.args.get("limit", 100))
    rows    = fetch_analyses_from_db(shop_id=shop_id, limit=limit)

    # Deserialise JSON string columns for response
    for r in rows:
        for col in ("products_discussed", "key_insights"):
            if isinstance(r.get(col), str):
                try:
                    r[col] = json.loads(r[col])
                except Exception:
                    r[col] = []
        # Convert datetime objects to ISO strings
        for col in ("started_at", "ended_at", "created_at"):
            if r.get(col) and not isinstance(r[col], str):
                r[col] = r[col].isoformat()

    return jsonify({
        "total":    len(rows),
        "analyses": rows
    }), 200


@app.route("/analyses/<session_id_or_id>", methods=["GET"])
def get_analysis_detail(session_id_or_id):
    """Return full analysis by DB id or session_id."""
    import sqlalchemy
    try:
        # Try numeric id first
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
            # Deserialise JSON columns
            for col in ("products_discussed", "key_insights", "missed_opportunities",
                        "stages_reached", "full_analysis", "conversation_transcript"):
                if isinstance(record.get(col), str):
                    try:
                        record[col] = json.loads(record[col])
                    except Exception:
                        pass
            # Datetime to string
            for col in ("started_at", "ended_at", "created_at"):
                if record.get(col) and not isinstance(record[col], str):
                    record[col] = record[col].isoformat()
            return jsonify(record), 200
    except Exception as e:
        logger.error(f"get_analysis_detail error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/analyses/stats", methods=["GET"])
def get_analyses_stats():
    """Aggregate stats from DB."""
    shop_id = request.args.get("shop_id")
    stats   = fetch_analyses_stats_from_db(shop_id=shop_id)
    if not stats:
        return jsonify({"message": "No analyses yet"}), 200
    return jsonify(stats), 200



@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ShopMate Conversational AI is running"}), 200


if __name__ == "__main__":
    logger.info("Starting ShopMate Conversational Retail Assistant")
    app.run(port=os.getenv("PORT_SERVER") or 3000, debug=True)