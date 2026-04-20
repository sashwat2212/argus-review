import pytest
from argus_core.diff_parser import parse_diff

SAMPLE_PYTHON_DIFF = """\
diff --git a/auth/middleware.py b/auth/middleware.py
index abc123..def456 100644
--- a/auth/middleware.py
+++ b/auth/middleware.py
@@ -40,7 +40,12 @@
 def verify_token(token: str):
-    payload = jwt.decode(token, SECRET)
-    return payload["user_id"]
+    payload = jwt.decode(token, SECRET)
+    user_id = payload.get("user_id")
+    return user_id
+
+def require_auth(func):
+    @wraps(func)
+    async def wrapper(*args, **kwargs):
+        token = request.headers.get("Auth")
+        return await func(*args, **kwargs)
+    return wrapper
"""

UNSUPPORTED_DIFF = """\
diff --git a/data.csv b/data.csv
index abc..def 100644
--- a/data.csv
+++ b/data.csv
@@ -1,2 +1,3 @@
 col1,col2
+new,row
"""


def test_parse_python_diff():
    chunks = parse_diff(SAMPLE_PYTHON_DIFF)
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.file_path == "auth/middleware.py"
    assert chunk.language == "python"
    assert chunk.start_line == 40
    assert any("require_auth" in line for line in chunk.lines)


def test_unsupported_extension_skipped():
    chunks = parse_diff(UNSUPPORTED_DIFF)
    assert chunks == []


def test_empty_diff_returns_empty():
    assert parse_diff("") == []


def test_binary_file_skipped():
    binary_diff = (
        "diff --git a/image.py b/image.py\nBinary files a/image.py and b/image.py differ\n"
    )
    assert parse_diff(binary_diff) == []


def test_chunking_large_diff():
    lines = [f"+line_{i} = {i}" for i in range(200)]
    hunk = "@@ -1,200 +1,200 @@\n"
    header = "diff --git a/big.py b/big.py\nindex abc..def 100644\n--- a/big.py\n+++ b/big.py\n"
    raw = header + hunk + "\n".join(lines)
    chunks = parse_diff(raw, max_chunk_lines=100)
    assert len(chunks) >= 2
