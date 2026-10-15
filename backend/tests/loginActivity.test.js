const assert = require("node:assert/strict");
const test = require("node:test");
const { pool } = require("../db");
const loginActivityModel = require("../models/loginActivityModel");
const userModel = require("../models/userModel");
const controller = require("../controllers/apiController");
const { SESSION_TTL_MS, createSession, getSessionUser, requireAdmin } = require("../auth");
const { detectDevice } = require("../clientMetadata");

const makeResponse = () => ({
  headers: {},
  statusCode: 200,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  set(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeLoginRequest = (username, password, cookie) => ({
  body: { username, password },
  headers: cookie ? { cookie } : {},
  ip: "203.0.113.8",
  socket: { remoteAddress: "127.0.0.1" },
  get(name) {
    return name.toLowerCase() === "user-agent" ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" : undefined;
  },
});

test("successful logins create distinguishable sessions and logout updates only its session", async (t) => {
  const originalAuthenticate = userModel.authenticate;
  const originalCreateSuccess = loginActivityModel.createSuccessfulLogin;
  const originalMarkLoggedOut = loginActivityModel.markLoggedOut;
  const originalMarkExpired = loginActivityModel.markExpired;
  const created = [];
  const loggedOut = [];
  userModel.authenticate = async () => ({
    id: 42,
    username: "admin",
    full_name: "Barangay Admin",
    role: "admin",
  });
  loginActivityModel.createSuccessfulLogin = async (entry) => { created.push(entry); };
  loginActivityModel.markLoggedOut = async (sessionId) => {
    loggedOut.push(sessionId);
    return 1;
  };
  loginActivityModel.markExpired = async () => {};
  t.after(() => {
    userModel.authenticate = originalAuthenticate;
    loginActivityModel.createSuccessfulLogin = originalCreateSuccess;
    loginActivityModel.markLoggedOut = originalMarkLoggedOut;
    loginActivityModel.markExpired = originalMarkExpired;
  });

  const firstResponse = makeResponse();
  await controller.loginUser(makeLoginRequest("admin", "not-to-be-stored"), firstResponse);
  const secondResponse = makeResponse();
  await controller.loginUser(makeLoginRequest("admin", "another-password"), secondResponse);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(created.length, 2);
  assert.equal(created[0].user.id, 42);
  assert.equal(created[0].metadata.ipAddress, "203.0.113.8");
  assert.equal(new Set(created.map((entry) => entry.sessionId)).size, 2);
  assert.equal(JSON.stringify(created).includes("not-to-be-stored"), false);

  const firstCookie = firstResponse.headers["Set-Cookie"].split(";")[0];
  const secondCookie = secondResponse.headers["Set-Cookie"].split(";")[0];
  assert.notEqual(firstCookie, secondCookie);
  assert.equal(getSessionUser({ headers: { cookie: firstCookie } }).id, 42);

  const logoutResponse = makeResponse();
  await controller.logoutUser(makeLoginRequest("", "", firstCookie), logoutResponse);
  assert.deepEqual(loggedOut, [created[0].sessionId]);
  assert.equal(getSessionUser({ headers: { cookie: firstCookie } }), null);
  assert.equal(getSessionUser({ headers: { cookie: secondCookie } }).id, 42);
});

test("failed login attempts store a safe category and never the submitted password", async (t) => {
  const originalAuthenticate = userModel.authenticate;
  const originalCreateFailed = loginActivityModel.createFailedLogin;
  const captured = [];
  userModel.authenticate = async () => null;
  loginActivityModel.createFailedLogin = async (entry) => { captured.push(entry); };
  t.after(() => {
    userModel.authenticate = originalAuthenticate;
    loginActivityModel.createFailedLogin = originalCreateFailed;
  });

  const response = makeResponse();
  await controller.loginUser(makeLoginRequest("unknown-admin", "secret-password"), response);

  assert.equal(response.statusCode, 401);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].accountIdentifier, "unknown-admin");
  assert.equal(captured[0].failureReason, "invalid_credentials");
  assert.equal(JSON.stringify(captured).includes("secret-password"), false);
});

test("expired sessions are marked expired only when their expiry is detected", async (t) => {
  const originalNow = Date.now;
  const originalMarkExpired = loginActivityModel.markExpired;
  const baseTime = originalNow();
  const expired = [];
  const sessionId = "909ad9de-9060-431f-a799-a2eb855516e3";
  const response = makeResponse();
  Date.now = () => baseTime;
  loginActivityModel.markExpired = async (id) => { expired.push(id); };
  t.after(() => {
    Date.now = originalNow;
    loginActivityModel.markExpired = originalMarkExpired;
  });

  createSession(response, { id: 7, role: "admin" }, sessionId);
  const cookie = response.headers["Set-Cookie"].split(";")[0];
  Date.now = () => baseTime + SESSION_TTL_MS + 1;

  assert.equal(getSessionUser({ headers: { cookie } }), null);
  assert.equal(expired.includes(sessionId), true);
});

test("activity query uses validated filters, sort columns, and pagination parameters", async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1
      ? { rows: [{ total: 0 }] }
      : { rows: [] };
  };
  t.after(() => { pool.query = originalQuery; });

  await loginActivityModel.findPage({
    search: "admin",
    eventType: "logout",
    status: "logged_out",
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-02-01T00:00:00.000Z",
    sort: "last_activity_at",
    page: 2,
    limit: 25,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /a\.logout_at IS NOT NULL/);
  assert.match(calls[1].sql, /ORDER BY a\.last_activity_at DESC/);
  assert.match(calls[1].sql, /LIMIT \$5 OFFSET \$6/);
  assert.deepEqual(calls[1].params, [
    "%admin%",
    "logged_out",
    "2026-01-01T00:00:00.000Z",
    "2026-02-01T00:00:00.000Z",
    25,
    25,
  ]);
});

test("login and failed-attempt inserts contain no authentication secrets", async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 1 }] };
  };
  t.after(() => { pool.query = originalQuery; });

  await loginActivityModel.createSuccessfulLogin({
    sessionId: "8f7dd9f4-6d72-49a9-9c7e-8e05e1669545",
    user: { id: 42, username: "admin" },
    expiresInMs: 8 * 60 * 60 * 1000,
    metadata: {
      ipAddress: "203.0.113.8",
      deviceType: "Desktop",
      operatingSystem: "Windows",
      browser: "Chrome",
      userAgent: "Mozilla/5.0",
    },
  });
  await loginActivityModel.createFailedLogin({
    accountIdentifier: "unknown-admin",
    failureReason: "invalid_credentials",
    metadata: {
      ipAddress: "203.0.113.8",
      deviceType: "Desktop",
      operatingSystem: "Windows",
      browser: "Chrome",
      userAgent: "Mozilla/5.0",
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO login_activity/);
  assert.match(calls[0].sql, /'login_success', 'active'/);
  assert.deepEqual(calls[0].params.slice(0, 3), [
    "8f7dd9f4-6d72-49a9-9c7e-8e05e1669545",
    42,
    "admin",
  ]);
  assert.match(calls[1].sql, /'login_failed', 'failed'/);
  assert.equal(calls[1].params.includes("password"), false);
});

test("administrator gate rejects non-admin users and device detection stays informational", () => {
  let nextCalled = false;
  const response = makeResponse();
  requireAdmin({ user: { role: "staff" } }, response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
  assert.deepEqual(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0"), {
    deviceType: "Mobile",
    operatingSystem: "iOS",
    browser: "Chrome",
  });
  assert.deepEqual(detectDevice(null), {
    deviceType: null,
    operatingSystem: null,
    browser: null,
  });
  assert.deepEqual(detectDevice("unrecognized client"), {
    deviceType: null,
    operatingSystem: null,
    browser: null,
  });
});

test("activity page and API reject unauthenticated and non-admin users", async (t) => {
  const { app } = require("../server");
  const originalAuthenticate = userModel.authenticate;
  const originalCreateSuccess = loginActivityModel.createSuccessfulLogin;
  const originalExpire = loginActivityModel.expireElapsedSessions;
  const originalFindPage = loginActivityModel.findPage;
  const originalSummary = loginActivityModel.getSummary;
  userModel.authenticate = async () => ({
    id: 42,
    username: "admin",
    full_name: "Barangay Admin",
    role: "admin",
  });
  loginActivityModel.createSuccessfulLogin = async () => {};
  loginActivityModel.expireElapsedSessions = async () => {};
  loginActivityModel.findPage = async () => ({ data: [], total: 0, page: 1, limit: 25 });
  loginActivityModel.getSummary = async () => ({
    successful_logins: 0,
    failed_logins: 0,
    active_sessions: 0,
    logouts: 0,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    userModel.authenticate = originalAuthenticate;
    loginActivityModel.createSuccessfulLogin = originalCreateSuccess;
    loginActivityModel.expireElapsedSessions = originalExpire;
    loginActivityModel.findPage = originalFindPage;
    loginActivityModel.getSummary = originalSummary;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthenticated = await fetch(`${baseUrl}/activity-logs`);
  assert.equal(unauthenticated.status, 401);

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-password" }),
  });
  assert.equal(loginResponse.status, 200);
  const adminCookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const activityResponse = await fetch(`${baseUrl}/activity-logs`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(activityResponse.status, 200);
  assert.equal((await activityResponse.json()).summary.active_sessions, 0);
  const pageResponse = await fetch(`${baseUrl}/activityLogs.html`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Login Activity/);

  const staffResponse = makeResponse();
  createSession(staffResponse, { id: 73, username: "staff", role: "staff" }, "staff-session");
  const staffCookie = staffResponse.headers["Set-Cookie"].split(";")[0];
  const denied = await fetch(`${baseUrl}/activity-logs`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(denied.status, 403);
  const deniedPage = await fetch(`${baseUrl}/activityLogs.html`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(deniedPage.status, 403);
});
