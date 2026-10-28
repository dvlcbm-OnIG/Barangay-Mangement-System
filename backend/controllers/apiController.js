const { pool } = require("../db");
const announcementModel = require("../models/announcementModel");
const dashboardModel = require("../models/dashboardModel");
const documentRequestModel = require("../models/documentRequestModel");
const officialModel = require("../models/officialModel");
const residentModel = require("../models/residentModel");
const userModel = require("../models/userModel");
const { createSession, destroySession } = require("../auth");

const normalizeText = (value) => (value === undefined || value === null ? null : String(value).trim());

const sanitizePayload = (payload, allowedFields) => {
  const nextPayload = {};
  for (const field of allowedFields) {
    const value = payload?.[field];
    if (value !== undefined) nextPayload[field] = value === "" ? null : value;
  }
  return nextPayload;
};

const handleDatabaseError = (res, error) => {
  const clientErrors = {
    "22P02": "Invalid value provided.",
    "22007": "Invalid date or time value.",
    "22008": "Date or time value is out of range.",
    "23503": "A related record does not exist.",
    "23505": "A record with that identifier already exists.",
  };
  const message = clientErrors[error.code] || error.message || "Database operation failed.";
  const statusCode = error.code === "23505" ? 409 : clientErrors[error.code] ? 400 : 500;
  return res.status(statusCode).json({ message });
};

const validateDate = (payload, field, label) => {
  const value = payload[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${label} must be a valid date.`;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return `${label} must be a valid date.`;
  }
  return null;
};

const validateChoice = (payload, field, allowed, label) =>
  payload[field] !== undefined && payload[field] !== null && !allowed.includes(payload[field])
    ? `${label} is invalid.`
    : null;

const validateRequiredUpdates = (payload, fields) => {
  for (const [field, label] of fields) {
    if (Object.hasOwn(payload, field) && !String(payload[field] ?? "").trim()) {
      return `${label} is required.`;
    }
  }
  return null;
};

const validateContactNumber = (payload) => {
  const value = payload.contact_number;
  if (value === undefined || value === null || value === "") return null;
  return /^[0-9+().\-\s]{7,20}$/.test(value) ? null : "Contact number must contain 7 to 20 valid characters.";
};

const validateRecordId = (req, res) => {
  if (/^[1-9]\d*$/.test(req.params.id)) return true;
  res.status(400).json({ message: "A valid record ID is required." });
  return false;
};

const rejectIdentifierChanges = (req, res, identifiers) => {
  const changedIdentifier = identifiers.find((field) => Object.hasOwn(req.body || {}, field));
  if (!changedIdentifier) return false;
  res.status(400).json({ message: "Record IDs cannot be changed." });
  return true;
};

const showDashboard = async (_req, res) => {
  try {
    res.json(await dashboardModel.getSummary());
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const createComplaint = async (req, res) => {
  const payload = sanitizePayload(req.body, [
    "resident_id",
    "complainant_name",
    "complainant_contact",
    "complaint_type",
    "subject",
    "description",
    "status",
    "priority",
  ]);

  if (!payload.complainant_name || !payload.complaint_type || !payload.subject || !payload.description) {
    return res.status(400).json({ message: "Complainant name, complaint type, subject, and description are required." });
  }

  const validationError =
    validateChoice(payload, "status", ["Submitted", "Under Review", "Validated", "Resolved", "Rejected"], "Status") ||
    validateChoice(payload, "priority", ["Low", "Medium", "High", "Urgent"], "Priority") ||
    validateContactNumber({ contact_number: payload.complainant_contact });

  if (validationError) return res.status(400).json({ message: validationError });

  if (payload.resident_id && !/^[1-9]\d*$/.test(String(payload.resident_id))) {
    return res.status(400).json({ message: "Please select a valid resident." });
  }

  try {
    if (payload.resident_id) {
      const result = await pool.query("SELECT id FROM residents WHERE id = $1 LIMIT 1", [payload.resident_id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Resident not found." });
      }
    }

    const complaint = await pool.query(
      `INSERT INTO complaints (
        complaint_id,
        resident_id,
        complainant_name,
        complainant_contact,
        complaint_type,
        subject,
        description,
        status,
        priority,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *`,
      [
        `CMP-${Date.now()}`,
        payload.resident_id || null,
        payload.complainant_name,
        payload.complainant_contact || null,
        payload.complaint_type,
        payload.subject,
        payload.description,
        payload.status || "Submitted",
        payload.priority || "Medium",
      ]
    );

    res.status(201).json(complaint.rows[0]);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const showAllComplaints = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, r.full_name AS resident_name
       FROM complaints c
       LEFT JOIN residents r ON r.id = c.resident_id
       ORDER BY c.id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const updateComplaint = async (req, res) => {
  if (rejectIdentifierChanges(req, res, ["id", "complaint_id"])) return;
  const payload = sanitizePayload(req.body, [
    "resident_id",
    "complainant_name",
    "complainant_contact",
    "complaint_type",
    "subject",
    "description",
    "status",
    "priority",
  ]);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: "No valid complaint fields were provided." });
  }

  const validationError =
    validateDate({ date: payload.resolved_at }, "date", "Resolved date") ||
    validateChoice(payload, "status", ["Submitted", "Under Review", "Validated", "Resolved", "Rejected"], "Status") ||
    validateChoice(payload, "priority", ["Low", "Medium", "High", "Urgent"], "Priority") ||
    validateContactNumber({ contact_number: payload.complainant_contact }) ||
    validateRequiredUpdates(payload, [
      ["complainant_name", "Complainant name"],
      ["complaint_type", "Complaint type"],
      ["subject", "Subject"],
      ["description", "Description"],
      ["status", "Status"],
    ]);

  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateRecordId(req, res)) return;

  if (payload.resident_id && !/^[1-9]\d*$/.test(String(payload.resident_id))) {
    return res.status(400).json({ message: "Please select a valid resident." });
  }

  try {
    if (payload.resident_id) {
      const residentExists = await pool.query("SELECT id FROM residents WHERE id = $1 LIMIT 1", [payload.resident_id]);
      if (residentExists.rowCount === 0) {
        return res.status(404).json({ message: "Resident not found." });
      }
    }

    const values = [];
    const assignments = [];
    Object.entries(payload).forEach(([field, value]) => {
      values.push(value === "" ? null : value);
      assignments.push(`${field} = $${values.length}`);
    });
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE complaints SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Complaint not found." });
    res.json(result.rows[0]);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const deleteComplaint = async (req, res) => {
  if (!validateRecordId(req, res)) return;
  try {
    const result = await pool.query("DELETE FROM complaints WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: "Complaint not found." });
    res.json({ message: "Complaint deleted successfully." });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const loginUser = async (req, res) => {
  const username = normalizeText(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  try {
    const user = await userModel.authenticate(username, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    createSession(res, user);
    res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Could not complete login:", error.message);
    res.status(500).json({ message: "Unable to process login right now." });
  }
};

const createProfileAccount = async (req, res) => {
  const profileType = req.body?.profile_type;
  const profileId = req.body?.profile_id;
  const username = normalizeText(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (profileType !== "resident" && profileType !== "official") {
    return res.status(400).json({ message: "Profile type must be resident or official." });
  }
  if (!/^[1-9]\d*$/.test(String(profileId ?? "")) || !Number.isSafeInteger(Number(profileId))) {
    return res.status(400).json({ message: "A valid profile ID is required." });
  }
  if (!username || username.length < 3 || username.length > 64 || !/^[A-Za-z0-9._-]+$/.test(username)) {
    return res.status(400).json({ message: "Username must be 3 to 64 characters using letters, numbers, periods, underscores, or hyphens." });
  }
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Password must be between 12 and 128 characters." });
  }

  try {
    const account = await userModel.createProfileAccount({
      profileType,
      profileId: Number(profileId),
      username,
      password,
    });
    const responseUser = {
      id: account.id,
      username: account.username,
      full_name: account.full_name,
      role: account.role,
    };
    if (account.role === "resident") responseUser.resident_id = account.resident_id;
    if (account.role === "official") responseUser.official_id = account.official_id;
    return res.status(201).json({ message: "Login account created and linked successfully.", user: responseUser });
  } catch (error) {
    if (error.code === "PROFILE_NOT_FOUND") {
      return res.status(404).json({ message: "The selected profile was not found." });
    }
    if (error.code === "PROFILE_ALREADY_LINKED" || error.constraint === "users_resident_id_key" || error.constraint === "users_official_id_key") {
      return res.status(409).json({ message: "The selected profile already has a login account." });
    }
    if (error.code === "23505" && error.constraint === "users_username_key") {
      return res.status(409).json({ message: "That username is already in use." });
    }
    if (error.code === "23505") {
      return res.status(409).json({ message: "The account conflicts with an existing username or profile link." });
    }
    if (error.code === "23503" || error.code === "23514") {
      return res.status(409).json({ message: "The profile link is invalid or conflicts with the account role." });
    }
    console.error("Could not create profile account:", error.message);
    return res.status(500).json({ message: "Unable to create the login account right now." });
  }
};

const logoutUser = async (req, res) => {
  destroySession(req, res);
  res.json({ message: "Logged out successfully." });
};

const getCurrentUser = (req, res) => {
  res.json({ user: req.user });
};

const createResident = async (req, res) => {
  const payload = sanitizePayload(req.body, [
    "full_name",
    "birth_date",
    "sex",
    "address",
    "contact_number",
    "civil_status",
  ]);

  if (!payload.full_name || !payload.address || !payload.sex) {
    return res.status(400).json({ message: "Full name, address, and sex are required." });
  }
  const validationError =
    validateDate(payload, "birth_date", "Birth date") ||
    validateChoice(payload, "sex", ["Male", "Female", "Other"], "Sex") ||
    validateChoice(payload, "civil_status", ["Single", "Married", "Widowed", "Separated"], "Civil status") ||
    validateContactNumber(payload) ||
    validateRequiredUpdates(payload, [
      ["full_name", "Full name"],
      ["address", "Address"],
      ["sex", "Sex"],
    ]);
  if (validationError) return res.status(400).json({ message: validationError });

  payload.resident_id = `RES-${Date.now()}`;

  try {
    const resident = await residentModel.create({
      ...payload,
      birth_date: payload.birth_date || null,
      contact_number: payload.contact_number || null,
      civil_status: payload.civil_status || null,
    });
    res.status(201).json(resident);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const showAllResidents = async (req, res) => {
  try {
    const { rows, total, page, limit } = await residentModel.findPage({
      search: normalizeText(req.query.search) || "",
      page: Math.max(1, Number(req.query.page || 1)),
      limit: Math.min(100, Math.max(1, Number(req.query.limit || 10))),
    });
    res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const updateResident = async (req, res) => {
  if (rejectIdentifierChanges(req, res, ["id", "resident_id"])) return;
  const payload = sanitizePayload(req.body, [
    "full_name",
    "birth_date",
    "sex",
    "address",
    "contact_number",
    "civil_status",
  ]);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: "No valid resident fields were provided." });
  }
  const validationError =
    validateDate(payload, "birth_date", "Birth date") ||
    validateChoice(payload, "sex", ["Male", "Female", "Other"], "Sex") ||
    validateChoice(payload, "civil_status", ["Single", "Married", "Widowed", "Separated"], "Civil status") ||
    validateContactNumber(payload) ||
    validateRequiredUpdates(payload, [
      ["full_name", "Full name"],
      ["address", "Address"],
      ["sex", "Sex"],
    ]);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateRecordId(req, res)) return;

  try {
    const resident = await residentModel.update(req.params.id, payload);
    if (!resident) return res.status(404).json({ message: "Resident not found." });
    res.json(resident);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const deleteResident = async (req, res) => {
  if (!validateRecordId(req, res)) return;
  try {
    const deleted = await residentModel.delete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Resident not found." });
    res.json({ message: "Resident deleted successfully." });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const createDocumentRequest = async (req, res) => {
  const payload = sanitizePayload(req.body, ["resident_id", "document_type", "date_requested", "status"]);
  if (!payload.resident_id || !payload.document_type) {
    return res.status(400).json({ message: "Resident and document type are required." });
  }
  if (!/^[1-9]\d*$/.test(String(payload.resident_id))) {
    return res.status(400).json({ message: "Please select a valid resident." });
  }
  const validationError =
    validateDate(payload, "date_requested", "Request date") ||
    validateChoice(payload, "status", ["Pending", "Processing", "Completed"], "Status");
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    if (!(await documentRequestModel.residentExists(payload.resident_id))) {
      return res.status(404).json({ message: "Resident not found." });
    }
    const request = await documentRequestModel.create({
      ...payload,
      date_requested: payload.date_requested || new Date().toISOString().slice(0, 10),
      status: payload.status || "Pending",
    });
    res.status(201).json(request);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const showAllDocumentRequests = async (_req, res) => {
  try {
    res.json(await documentRequestModel.findAllWithResidentNames());
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const updateDocumentRequest = async (req, res) => {
  if (rejectIdentifierChanges(req, res, ["id"])) return;
  const payload = sanitizePayload(req.body, ["resident_id", "document_type", "date_requested", "status"]);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: "No valid request fields were provided." });
  }
  const validationError =
    validateDate(payload, "date_requested", "Request date") ||
    validateChoice(payload, "status", ["Pending", "Processing", "Completed"], "Status") ||
    validateRequiredUpdates(payload, [
      ["resident_id", "Resident"],
      ["document_type", "Document type"],
      ["status", "Status"],
    ]);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateRecordId(req, res)) return;
  if (payload.resident_id && !/^[1-9]\d*$/.test(String(payload.resident_id))) {
    return res.status(400).json({ message: "Please select a valid resident." });
  }

  try {
    if (payload.resident_id && !(await documentRequestModel.residentExists(payload.resident_id))) {
      return res.status(404).json({ message: "Resident not found." });
    }
    const request = await documentRequestModel.update(req.params.id, payload);
    if (!request) return res.status(404).json({ message: "Document request not found." });
    res.json(request);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const deleteDocumentRequest = async (req, res) => {
  if (!validateRecordId(req, res)) return;
  try {
    const deleted = await documentRequestModel.delete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Document request not found." });
    res.json({ message: "Document request deleted successfully." });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const createOfficial = async (req, res) => {
  const payload = sanitizePayload(req.body, ["official_id", "full_name", "position", "term", "contact_number"]);
  if (!payload.full_name || !payload.position) {
    return res.status(400).json({ message: "Official name and position are required." });
  }
  const validationError = validateContactNumber(payload);
  if (validationError) return res.status(400).json({ message: validationError });

  if (!payload.official_id) payload.official_id = `OFF-${Date.now()}`;

  try {
    const official = await officialModel.create({
      ...payload,
      term: payload.term || null,
      contact_number: payload.contact_number || null,
    });
    res.status(201).json(official);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const showAllOfficials = async (_req, res) => {
  try {
    res.json(await officialModel.findAll());
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const updateOfficial = async (req, res) => {
  if (rejectIdentifierChanges(req, res, ["id", "official_id"])) return;
  const payload = sanitizePayload(req.body, ["full_name", "position", "term", "contact_number"]);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: "No valid official fields were provided." });
  }
  const validationError = validateRequiredUpdates(payload, [
    ["full_name", "Official name"],
    ["position", "Position"],
  ]) || validateContactNumber(payload);
  if (validationError) return res.status(400).json({ message: validationError });
  if (!validateRecordId(req, res)) return;

  try {
    const official = await officialModel.update(req.params.id, payload);
    if (!official) return res.status(404).json({ message: "Official not found." });
    res.json(official);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const deleteOfficial = async (req, res) => {
  if (!validateRecordId(req, res)) return;
  try {
    const deleted = await officialModel.delete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Official not found." });
    res.json({ message: "Official deleted successfully." });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const createAnnouncement = async (req, res) => {
  const payload = sanitizePayload(req.body, ["announcement_id", "title", "content", "date_published"]);
  if (!payload.title || !payload.content) {
    return res.status(400).json({ message: "Announcement title and content are required." });
  }
  const validationError = validateDate(payload, "date_published", "Publish date");
  if (validationError) return res.status(400).json({ message: validationError });

  if (!payload.announcement_id) payload.announcement_id = `ANN-${Date.now()}`;

  try {
    const announcement = await announcementModel.create({
      ...payload,
      date_published: payload.date_published || new Date().toISOString().slice(0, 10),
    });
    res.status(201).json(announcement);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const showAllAnnouncements = async (_req, res) => {
  try {
    res.json(await announcementModel.findAll());
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const updateAnnouncement = async (req, res) => {
  if (rejectIdentifierChanges(req, res, ["id", "announcement_id"])) return;
  const payload = sanitizePayload(req.body, ["title", "content", "date_published"]);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: "No valid announcement fields were provided." });
  }
  const validationError = validateDate(payload, "date_published", "Publish date");
  if (validationError || validateRequiredUpdates(payload, [
    ["title", "Announcement title"],
    ["content", "Announcement content"],
  ])) return res.status(400).json({ message: validationError || "Announcement title and content are required." });
  if (!validateRecordId(req, res)) return;

  try {
    const announcement = await announcementModel.update(req.params.id, payload);
    if (!announcement) return res.status(404).json({ message: "Announcement not found." });
    res.json(announcement);
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

const deleteAnnouncement = async (req, res) => {
  if (!validateRecordId(req, res)) return;
  try {
    const deleted = await announcementModel.delete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Announcement not found." });
    res.json({ message: "Announcement deleted successfully." });
  } catch (error) {
    handleDatabaseError(res, error);
  }
};

module.exports = {
  showDashboard,
  loginUser,
  createProfileAccount,
  logoutUser,
  getCurrentUser,
  createResident,
  showAllResidents,
  updateResident,
  deleteResident,
  createDocumentRequest,
  showAllDocumentRequests,
  updateDocumentRequest,
  deleteDocumentRequest,
  createComplaint,
  showAllComplaints,
  updateComplaint,
  deleteComplaint,
  createOfficial,
  showAllOfficials,
  updateOfficial,
  deleteOfficial,
  createAnnouncement,
  showAllAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
};
