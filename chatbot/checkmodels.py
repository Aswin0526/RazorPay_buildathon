from google import genai
import os

client = genai.Client(api_key="AIzaSyDHPQiAdDw6ams1CTEweGIPXBU3Ow--cYc")

print("Models available for your API key:\n")

for model in client.models.list():
    print(model.name)