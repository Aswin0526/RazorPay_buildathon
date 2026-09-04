import json
import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

try:
    from fastmcp import FastMCP
except Exception:
    try:
        from mcp.server.fastmcp import FastMCP
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "fastmcp is not installed. Install it with: pip install fastmcp"
        ) from exc


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()

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
        "keepalives_count": 5,
    },
)

mcp = FastMCP("shopmate")

ALLOWED_TABLES = {
    "global_products_view",
    "shops",
    "products",
    "orders",
    "order_items",
    "customers",
    "wishlist",
    "owners",
    "payments",
    "conversation_analyses",
    "online_orders",
}

FORBIDDEN_KEYWORDS = [
    "DROP",
    "DELETE",
    "INSERT",
    "UPDATE",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "GRANT",
    "REVOKE",
    "EXEC",
    "CALL",
]


def normalize_sql(sql: str) -> str:
    if not isinstance(sql, str) or not sql.strip():
        raise ValueError("SQL input is required.")

    cleaned = sql.strip().rstrip(";")
    upper = cleaned.upper()

    if not re.match(r"^SELECT\b", upper):
        raise ValueError("Only SELECT queries are allowed on this MCP server.")

    for keyword in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{keyword}\b", upper):
            raise ValueError(f"Unsafe SQL keyword blocked: {keyword}")

    return cleaned


def extract_table_names(sql: str) -> list[str]:
    matches = re.findall(r"\b(?:FROM|JOIN|INTO|UPDATE)\s+([\"']?[A-Za-z_][A-Za-z0-9_]*[\"']?)", sql, re.IGNORECASE)
    table_names = []
    for match in matches:
        table = match.strip('"\'')
        if table:
            table_names.append(table.lower())
    return table_names


def validate_table_access(sql: str) -> None:
    tables = extract_table_names(sql)
    if not tables:
        return
    for table in tables:
        if table not in ALLOWED_TABLES:
            raise ValueError(f"Access denied for table: {table}")


@mcp.tool()
def execute_sql(sql: str) -> str:
    """Execute a read-only SQL SELECT against the public database for the shopmate agent."""
    try:
        cleaned = normalize_sql(sql)
        validate_table_access(cleaned)

        with engine.connect() as conn:
            result = conn.execute(text(cleaned))
            rows = result.fetchall()
            if not rows:
                return "No rows returned"

            columns = list(result.keys())
            records = [dict(zip(columns, [str(v) if v is not None else "" for v in row])) for row in rows]
            return json.dumps(records, default=str)
    except Exception as exc:
        return f"SQL error: {exc}"


@mcp.tool()
def get_db_tables() -> list[str]:
    """List the allowed public tables available to the MCP agent."""
    return sorted(ALLOWED_TABLES)


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=5006)
