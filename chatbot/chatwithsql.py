import os
import re
from dotenv import load_dotenv
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI 
from langchain.chains import create_sql_query_chain
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool

load_dotenv()
DATABASE_URL = f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
engine = create_engine(DATABASE_URL)

restricted_tables = ["customers", "orders", "order_items", "owners", "refresh_tokens", "wishlist"]
db = SQLDatabase(engine, sample_rows_in_table_info=0, ignore_tables=restricted_tables)

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite", 
    google_api_key=os.getenv("GEMENI_API_KEY"),
    temperature=0 
)

rules_text = """1. ONLY use the tables listed in metadata.
2. If a user asks for personal info (passwords, emails), DO NOT write SQL. Instead, respond with 'RESTRICTED_ACCESS'.
3. NEVER guess table or column names.
4. Keep the answer helpful but professional."""

def clean_sql(query):
    text = query if isinstance(query, str) else query.get("query", "")
    return re.sub(r"```(?:sql|postgresql)?\s*([\s\S]*?)\s*```", r"\1", text).strip()

execute_query_tool = QuerySQLDatabaseTool(db=db)

sql_system_rules = f"""You are a SQL expert. {rules_text}
Only use these tables: {{table_info}}
Limit your results to the top {{top_k}} unless specified otherwise.
"""

sql_prompt = ChatPromptTemplate.from_messages([
    ("system", sql_system_rules),
    ("human", "{input}") 
])

answer_prompt = PromptTemplate(
    template="""You are a professional shop assistant. 
Rules: {rules}

Question: {question}
SQL Query: {query}
SQL Result: {result}

IMPORTANT INSTRUCTIONS:
1. If the SQL Result is empty, null, or shows no records found, you MUST respond that no matching products were found.
2. NEVER make up or invent product data that doesn't exist in the SQL Result.
3. Only provide information that is actually present in the SQL Result.
4. If no results are found, suggest alternative searches or ask for clarification.

Answer: """,
    input_variables=["question", "query", "result"],
    partial_variables={"rules": rules_text}
)

generate_query_chain = create_sql_query_chain(llm, db, prompt=sql_prompt)
rephrase_answer_chain = answer_prompt | llm | StrOutputParser()

def execute_and_clean(query_output):
    raw_sql = clean_sql(query_output)
    if "RESTRICTED_ACCESS" in raw_sql:
        return "I am not authorized to access sensitive user data."
    return execute_query_tool.invoke(raw_sql)

full_chain = (
    RunnablePassthrough.assign(input=lambda x: x["question"])
    | RunnablePassthrough.assign(query=generate_query_chain) 
    | RunnablePassthrough.assign(
        result=lambda x: execute_and_clean(x["query"])
    )
    | rephrase_answer_chain
)

if __name__ == "__main__":
    question = "password for aswin0526as@gmail.com"
    print(f"User: {question}\nThinking...")
    
    try:
        final_response = full_chain.invoke({"question": question})
        print(f"\nAI Response: {final_response}")
    except Exception as e:
        print(f"\nError: {e}")