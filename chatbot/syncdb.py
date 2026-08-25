import mysql.connector
from mysql.connector import Error
import chromadb

def fetch_data(table_name):
    cursor = connection.cursor()
    query = f"select product_id,product_name,category,quantity,product_link from {table_name}"
    cursor.execute(query)
    results = cursor.fetchall()
    
    documents, ids, metadata = [],[],[]

    for id, product_name, cat, quantity, link in results:
        ids.append(str(id))
        metadata.append({"category": cat, "product_name": product_name})
        document_text = (
        (product_name if product_name else "") + 
        (cat if cat else "") + 
        (str(quantity) if quantity else "") + 
        (link if link else "")
        )
        documents.append(document_text)

    cursor.close()
    return ids, metadata, documents

try:
    connection = mysql.connector.connect(
            host="localhost",
            database="walmarthackathon",
            user="root",
            password="aswindb",
            port="3307"
        )
    if connection.is_connected():
        print("Successfully connected to MySQL Database.")
            
except Error as e:
    print("Error connecting to database")


ids, metadata, documents = fetch_data("b1_products")


chroma_client = chromadb.Client()
PERSIST_PATH = "./chroma_db_data"
chroma_client = chromadb.PersistentClient(path=PERSIST_PATH)

collection = chroma_client.get_or_create_collection(name="b1_products")

collection.add(
    ids= ids,
    documents=documents,
    metadatas=metadata
)

def ask():
    question = input("Enter a query : ").strip()
    res = collection.query(
    query_texts=[question],
    
        n_results=4
    )

    return res

def get():
    id = input("Enter the id : ").strip()
    res = collection.get(
    ids = [id],
    include=['metadatas', 'documents']
    )

    return res


# collection.update(
#     ids=["2"],
#     metadatas={"category":"Smartphones", "product_name":"iPhone 16e 128GB Black"},
#     documents=["1 iPhone 16e 128GB Black Smartphones 30 https://www.walmart.com/ip/Verizon-iPhone-16e-128GB-Black-Apple-Intelligence/15309074647?classType=VARIANT&athbdg=L1600"]
# )
print(ask())
print(get())


