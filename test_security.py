import os
import requests

# Issue 1: Hardcoded secret
AWS_KEY = "AKIA1234567890ABCDEF"

# Issue 2: Disabled SSL verification
resp = requests.get("https://api.example.com", verify=False)

# Issue 3: SQL injection via f-string
user_id = input("ID: ")
query = f"SELECT * FROM users WHERE id = {user_id}"
