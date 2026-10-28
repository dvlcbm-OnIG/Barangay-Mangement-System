const crypto = require("crypto");

const SESSION_COOKIE = "barangay_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const getCookieValue = (req, cookieName) => {
  const cookieHeader = req.headers.cookie || "";
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === cookieName) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return null;
};

const getSessionUser = (req) => {
  const token = getCookieValue(req, SESSION_COOKIE);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user;
};

const createSession = (res, user) => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
    }
  }
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  sessions.set(token, {
    user,
    expiresAt: now + SESSION_TTL_MS,
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
};

const destroySession = (req, res) => {
  const token = getCookieValue(req, SESSION_COOKIE);
  if (token) sessions.delete(token);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
};

const requireAuth = (req, res, next) => {
  const user = getSessionUser(req);
  if (user) {
    req.user = user;
    return next();
  }

  if (req.path.endsWith(".html") || (req.headers.accept || "").includes("text/html")) {
    return res.redirect("/login.html");
  }
  res.status(401).json({ message: "Authentication required." });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  res.status(403).json({ message: "Administrator access is required." });
};

module.exports = {
  SESSION_TTL_MS,
  createSession,
  destroySession,
  getSessionUser,
  requireAuth,
  requireAdmin,
};
