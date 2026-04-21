import os
import requests

# Hardcoded secret
API_KEY = "sk-1234567890abcdefghijk"

# SSL verification disabled
resp = requests.get("https://api.example.com", verify=False)

# SQL injection
user_id = input("ID: ")
query = f"SELECT * FROM users WHERE id = {user_id}"
