/**
 * Auth.gs: password hashing + a signed login token.
 * Apps Script web apps cannot set cookies, so the browser keeps the token
 * (in localStorage) and sends it with every request.
 */

const MAX_AGE = 7 * 24 * 3600; // stay logged in for 7 days
const HASH_ROUNDS = 1000;

// A random secret, created once and kept in Script Properties.
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("CRM_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("CRM_SECRET", secret);
  }
  return secret;
}

function hex_(bytes) {
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function hashPassword_(password, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, "");
  let digest = salt + password;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    digest = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest + password, Utilities.Charset.UTF_8));
  }
  return `${salt}$${digest}`;
}

function checkPassword_(password, stored) {
  return hashPassword_(password, stored.split("$")[0]) === stored;
}

function sign_(text) {
  return hex_(Utilities.computeHmacSha256Signature(text, secret_()));
}

// Token looks like: user_id.expiry_time.signature
function makeToken_(userId) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  return `${payload}.${sign_(payload)}`;
}

// Returns the user id if the token is valid and not expired, else null.
function readToken_(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [userId, expiry, signature] = parts;
  if (signature === sign_(`${userId}.${expiry}`) && Number(expiry) > Date.now() / 1000) return Number(userId);
  return null;
}
