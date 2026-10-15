const filterForm = document.getElementById("filters");
const tableBody = document.getElementById("activity-body");
const message = document.getElementById("message");
const pageSize = 25;
let currentPage = 1;
let totalPages = 1;

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
document.getElementById("timezone-note").textContent =
  `Timestamps are stored in UTC and shown in your browser's local timezone (${timezone}).`;

const displayValue = (value) => value === null || value === undefined || value === ""
  ? "Unavailable"
  : String(value);

const statusLabel = (status) => ({
  active: "Active",
  logged_out: "Logged out",
  expired: "Expired",
  failed: "Failed login",
}[status] || "Unknown");

const formatTimestamp = (value) => {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
};

const localDateBoundary = (value, nextDay = false) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
};

const addDetail = (list, label, value) => {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = displayValue(value);
  list.append(term, description);
};

const createRow = (record) => {
  const row = document.createElement("tr");
  const account = record.full_name || record.username || record.account_identifier ||
    (record.user_id ? `User ${record.user_id}` : "Unknown");
  const values = [
    account,
    record.event_type === "login_failed"
      ? "Failed login"
      : record.session_status === "logged_out"
        ? "Logout"
        : "Successful login",
    formatTimestamp(record.login_at),
    formatTimestamp(record.logout_at),
    displayValue(record.ip_address),
  ];

  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  }
  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `status ${record.session_status}`;
  status.textContent = statusLabel(record.session_status);
  statusCell.appendChild(status);
  row.insertBefore(statusCell, row.lastChild);

  const detailsCell = document.createElement("td");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "View details";
  const list = document.createElement("dl");
  const location = [record.location_city, record.location_region, record.location_country]
    .filter(Boolean)
    .join(", ");
  addDetail(list, "User ID", record.user_id);
  addDetail(list, "Session ID", record.session_id);
  addDetail(list, "Approximate location", location || "Unavailable");
  addDetail(list, "Device", record.device_type);
  addDetail(list, "Operating system", record.operating_system);
  addDetail(list, "Browser", record.browser);
  addDetail(list, "User agent", record.user_agent);
  addDetail(list, "Last activity", formatTimestamp(record.last_activity_at));
  addDetail(list, "Session expires", formatTimestamp(record.expires_at));
  addDetail(list, "Failure category", record.failure_reason);
  details.append(summary, list);
  detailsCell.appendChild(details);
  row.appendChild(detailsCell);
  return row;
};

const showEmptyState = (text) => {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  cell.textContent = text;
  row.appendChild(cell);
  tableBody.replaceChildren(row);
};

const loadActivity = async () => {
  const refreshButton = document.getElementById("refresh-button");
  refreshButton.disabled = true;
  message.textContent = "";
  message.className = "";
  showEmptyState("Loading activity...");

  const params = new URLSearchParams({
    page: String(currentPage),
    limit: String(pageSize),
    search: document.getElementById("search").value.trim(),
    eventType: document.getElementById("event-type").value,
    status: document.getElementById("status").value,
    sort: document.getElementById("sort").value,
  });
  const dateFrom = document.getElementById("date-from").value;
  const dateTo = document.getElementById("date-to").value;
  if (dateFrom) params.set("from", localDateBoundary(dateFrom));
  if (dateTo) params.set("to", localDateBoundary(dateTo, true));

  try {
    const response = await fetch(`/activity-logs?${params}`);
    const responseText = await response.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      if (/^\s*<!doctype html|^\s*<html/i.test(responseText)) {
        throw new Error(
          "This page is being served by a host without the activity API. Open it through the app backend (for localhost: http://localhost:3000/activityLogs.html), not a static preview server."
        );
      }
      throw new Error(`The server returned an invalid activity response (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(result.message || "Unable to load login activity.");
    if (!Array.isArray(result.data) || !result.summary) {
      throw new Error("The server response is missing activity data. Redeploy the latest backend.");
    }

    tableBody.replaceChildren();
    if (result.data.length === 0) {
      showEmptyState("No login activity matches these filters.");
    } else {
      for (const record of result.data) tableBody.appendChild(createRow(record));
    }

    document.getElementById("successful-logins").textContent = result.summary.successful_logins;
    document.getElementById("failed-logins").textContent = result.summary.failed_logins;
    document.getElementById("active-sessions").textContent = result.summary.active_sessions;
    document.getElementById("logouts").textContent = result.summary.logouts;
    totalPages = Math.max(1, Math.ceil(result.total / pageSize));
    document.getElementById("page-indicator").textContent =
      `Page ${currentPage} of ${totalPages} (${result.total} records)`;
    document.getElementById("prev-page").disabled = currentPage <= 1;
    document.getElementById("next-page").disabled = currentPage >= totalPages;
  } catch (error) {
    showEmptyState("Activity could not be loaded.");
    message.textContent = error.message;
    message.className = "error";
  } finally {
    refreshButton.disabled = false;
  }
};

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  currentPage = 1;
  loadActivity();
});
document.getElementById("refresh-button").addEventListener("click", loadActivity);
document.getElementById("prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadActivity();
  }
});
document.getElementById("next-page").addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage += 1;
    loadActivity();
  }
});

loadActivity();
