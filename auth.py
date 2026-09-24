"""Login helpers: password hashing + a signed login cookie. Standard library only."""
import hashlib
import hmac
import os
import secrets
import time

SECRET_FILE = "secret.key"
COOKIE = "crm_session"
MAX_AGE = 7 * 24 * 3600  # stay logged in for 7 days

if not os.path.exists(SECRET_FILE):
    with open(SECRET_FILE, "w") as f:
        f.write(secrets.token_hex(32))
SECRET = os.environ.get("CRM_SECRET") or open(SECRET_FILE).read().strip()


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def check_password(password, stored):
    salt = stored.split("$")[0]
    return hmac.compare_digest(hash_password(password, salt), stored)


def sign(text):
    return hmac.new(SECRET.encode(), text.encode(), hashlib.sha256).hexdigest()


def make_token(user_id):
    """Cookie value looks like: user_id.expiry_time.signature"""
    payload = f"{user_id}.{int(time.time()) + MAX_AGE}"
    return f"{payload}.{sign(payload)}"


def read_token(token):
    """Returns the user id if the cookie is valid and not expired, else None."""
    try:
        user_id, expiry, signature = (token or "").split(".")
        if hmac.compare_digest(signature, sign(f"{user_id}.{expiry}")) and int(expiry) > time.time():
            return int(user_id)
    except ValueError:
        pass
    return None
