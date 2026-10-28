const definitions = {
  residents: {
    endpoint: "/resident",
    formId: "resident-form",
    bodyId: "residents-body",
    fields: [
      { name: "resident_id", label: "Resident ID", type: "text", editable: false },
      { name: "full_name", label: "Full Name", type: "text", required: true },
      { name: "birth_date", label: "Birth Date", type: "date" },
      { name: "sex", label: "Sex", type: "select", required: true, options: ["Male", "Female", "Other"] },
      { name: "address", label: "Address", type: "text", required: true },
      { name: "contact_number", label: "Contact Number", type: "tel" },
      {
        name: "civil_status",
        label: "Civil Status",
        type: "select",
        options: ["Single", "Married", "Widowed", "Separated"],
      },
    ],
    paginated: true,
    validate(payload) {
      if (!payload.full_name?.trim()) return "Full name is required.";
      if (!payload.address?.trim()) return "Address is required.";
      if (!payload.sex) return "Sex is required.";
      return null;
    },
    success: "Resident updated successfully.",
  },
  requests: {
    endpoint: "/document-request",
    formId: "request-form",
    bodyId: "requests-body",
    fields: [
      { name: "resident_id", label: "Resident", type: "resident", required: true },
      { name: "document_type", label: "Document Type", type: "text", required: true },
      { name: "date_requested", label: "Date Requested", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["Pending", "Processing", "Completed"],
      },
    ],
    success: "Document request updated successfully.",
  },
  complaints: {
    endpoint: "/complaint",
    formId: "complaint-form",
    bodyId: "complaints-body",
    fields: [
      { name: "complaint_id", label: "Complaint ID", type: "text", editable: false },
      { name: "resident_id", label: "Resident", type: "resident" },
      { name: "complainant_name", label: "Complainant Name", type: "text", required: true },
      { name: "complainant_contact", label: "Contact Number", type: "tel" },
      {
        name: "complaint_type",
        label: "Complaint Type",
        type: "select",
        required: true,
        options: ["Noise", "Public Safety", "Infrastructure", "Sanitation", "Other"],
      },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["Submitted", "Under Review", "Validated", "Resolved", "Rejected"],
      },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        required: true,
        options: ["Low", "Medium", "High", "Urgent"],
      },
    ],
    success: "Complaint updated successfully.",
  },
  officials: {
    endpoint: "/official",
    formId: "official-form",
    bodyId: "officials-body",
    fields: [
      { name: "official_id", label: "Official ID", type: "text", editable: false },
      { name: "full_name", label: "Full Name", type: "text", required: true },
      { name: "position", label: "Position", type: "text", required: true },
      { name: "term", label: "Term", type: "text" },
      { name: "contact_number", label: "Contact Number", type: "tel" },
    ],
    success: "Official updated successfully.",
  },
  announcements: {
    endpoint: "/announcement",
    formId: "announcement-form",
    bodyId: "announcements-body",
    fields: [
      { name: "announcement_id", label: "Announcement ID", type: "text", editable: false },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "content", label: "Content", type: "textarea", required: true },
      { name: "date_published", label: "Date Published", type: "date" },
    ],
    success: "Announcement updated successfully.",
  },
};

const moduleName = document.body.dataset.module;
const definition = definitions[moduleName];

if (definition) {
  const form = document.getElementById(definition.formId);
  const tableBody = document.getElementById(definition.bodyId);
  const table = tableBody.closest("table");
  if (table.parentElement.style.overflowX !== "auto") {
    const wrapper = document.createElement("div");
    wrapper.style.overflowX = "auto";
    wrapper.className = "table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Scrollable management table");
    table.before(wrapper);
    wrapper.appendChild(table);
  } else {
    table.parentElement.classList.add("table-scroll");
    table.parentElement.tabIndex = 0;
    table.parentElement.setAttribute("role", "region");
    table.parentElement.setAttribute("aria-label", "Scrollable management table");
  }
  const message = document.getElementById("message");
  const records = new Map();
  let currentPage = 1;
  let lastPage = 1;
  let searchQuery = "";
  let residents = [];

  const setMessage = (text, type = "success") => {
    if (!message) return;
    message.textContent = text;
    message.className = type;
  };

  const parseResponse = async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "The request could not be completed.");
    return result;
  };

  const validatePayload = (payload) => {
    for (const field of definition.fields) {
      if (field.required && !String(payload[field.name] ?? "").trim()) {
        return `${field.label} is required.`;
      }
    }
    if (payload.contact_number && !/^[0-9+().\-\s]{7,20}$/.test(payload.contact_number)) {
      return "Contact number must contain 7 to 20 valid characters.";
    }
    if (definition.validate) return definition.validate(payload);
    return null;
  };

  const createEditor = (field, value) => {
    let input;
    if (field.type === "select" || field.type === "resident") {
      input = document.createElement("select");
      const options = field.type === "resident"
        ? residents.map((resident) => ({
            value: resident.id,
            label: `${resident.full_name} (${resident.resident_id || resident.id})`,
          }))
        : field.options.map((option) => ({ value: option, label: option }));
      if (!field.required) options.unshift({ value: "", label: "Select..." });
      if (value !== null && value !== undefined && value !== "" &&
          !options.some((option) => String(option.value) === String(value))) {
        options.unshift({ value, label: String(value) });
      }
      for (const optionData of options) {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        option.selected = String(optionData.value) === String(value ?? "");
        input.appendChild(option);
      }
    } else if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.value = value ?? "";
      input.rows = 3;
    } else {
      input = document.createElement("input");
      input.type = field.type;
      input.value = field.type === "date" && value
        ? String(value).slice(0, 10)
        : value ?? "";
    }

    input.name = field.name;
    input.setAttribute("aria-label", field.label);
    if (field.required) input.required = true;
    return input;
  };

  const appendTextCell = (row, value, label) => {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    cell.textContent = value === null || value === undefined ? "" : String(value);
    row.appendChild(cell);
  };

  const renderRow = (record) => {
    const row = document.createElement("tr");
    row.dataset.recordId = record.id;
    records.set(String(record.id), record);

    if (moduleName === "requests" || moduleName === "complaints") appendTextCell(row, record.id, "ID");
    for (const field of definition.fields) {
      if ((moduleName === "requests" || moduleName === "complaints") && field.name === "resident_id") {
        appendTextCell(row, record.resident_name || record.resident_id || "Unknown", field.label);
      } else {
        let value = record[field.name];
        if (field.type === "date" && value) value = new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString();
        if (moduleName === "complaints" && field.name === "status") {
          const pill = document.createElement("span");
          pill.className = `status-pill ${String(value || "Submitted").toLowerCase().replace(/\s+/g, "-")}`;
          pill.textContent = value || "Submitted";
          const cell = document.createElement("td");
          cell.dataset.label = field.label;
          cell.appendChild(pill);
          row.appendChild(cell);
          continue;
        }
        appendTextCell(row, value, field.label);
      }
    }

    const actionCell = document.createElement("td");
    actionCell.dataset.label = "Actions";
    actionCell.dataset.actions = "true";
    const actions = document.createElement("div");
    actions.className = "actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.dataset.editId = record.id;
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    deleteButton.dataset.deleteId = record.id;
    actions.append(editButton, deleteButton);
    actionCell.appendChild(actions);
    row.appendChild(actionCell);
    return row;
  };

  const renderEditingRow = (record) => {
    const row = document.createElement("tr");
    row.dataset.recordId = record.id;
    if (moduleName === "requests" || moduleName === "complaints") appendTextCell(row, record.id, "ID");
    for (const field of definition.fields) {
      const cell = document.createElement("td");
      cell.dataset.label = field.label;
      if (field.editable === false) {
        let value = record[field.name];
        if (field.type === "date" && value) {
          value = new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString();
        }
        cell.textContent = value === null || value === undefined ? "" : String(value);
      } else {
        cell.appendChild(createEditor(field, record[field.name]));
      }
      row.appendChild(cell);
    }

    const actionCell = document.createElement("td");
    actionCell.dataset.label = "Actions";
    actionCell.dataset.actions = "true";
    const actions = document.createElement("div");
    actions.className = "actions";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.dataset.saveId = record.id;
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.dataset.cancelId = record.id;
    actions.append(saveButton, cancelButton);
    actionCell.appendChild(actions);
    row.appendChild(actionCell);
    return row;
  };

  const renderEmptyState = () => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = tableBody.closest("table").querySelectorAll("thead th").length;
    row.className = "empty-row";
    cell.textContent = "No records found.";
    cell.className = "muted";
    row.appendChild(cell);
    tableBody.replaceChildren(row);
  };

  const loadResidents = async () => {
    residents = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await parseResponse(await fetch(`/resident?page=${page}&limit=100`));
      residents.push(...(result.data || []));
      totalPages = result.totalPages || 1;
      page += 1;
    } while (page <= totalPages);
    if (moduleName === "requests" || moduleName === "complaints") {
      const select = form.elements.namedItem("resident_id");
      if (select) {
        select.replaceChildren(new Option("Select resident", ""));
        for (const resident of residents) {
          select.add(new Option(`${resident.full_name} (${resident.resident_id || resident.id})`, resident.id));
        }
      }
    }
  };

  const loadRecords = async () => {
    const url = new URL(definition.endpoint, window.location.origin);
    if (definition.paginated) {
      url.searchParams.set("page", currentPage);
      url.searchParams.set("limit", "10");
      url.searchParams.set("search", searchQuery);
    }
    const result = await parseResponse(await fetch(url));
    const entries = definition.paginated ? result.data || [] : result;
    records.clear();
    tableBody.replaceChildren();
    for (const record of entries) tableBody.appendChild(renderRow(record));
    if (entries.length === 0) renderEmptyState();

    if (definition.paginated) {
      lastPage = Math.max(1, result.totalPages || 1);
      document.getElementById("page-indicator").textContent = `Page ${currentPage} of ${lastPage}`;
      document.getElementById("prev-page").disabled = currentPage <= 1;
      document.getElementById("next-page").disabled = currentPage >= lastPage;
    }
  };

  const readRowPayload = (row) => {
    const payload = {};
    for (const field of definition.fields) {
      if (field.editable === false) continue;
      const value = row.querySelector(`[name="${field.name}"]`).value.trim();
      payload[field.name] = value === "" ? null : value;
    }
    return payload;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;

    const payload = Object.fromEntries(new FormData(form).entries());
    const validationError = validatePayload(payload);
    if (validationError) {
      setMessage(validationError, "error");
      return;
    }

    submitButton.disabled = true;
    const submitLabel = submitButton.textContent;
    submitButton.textContent = "Saving...";
    try {
      await parseResponse(await fetch(definition.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      form.reset();
      setMessage("Record created successfully.");
      currentPage = 1;
      try {
        await loadRecords();
      } catch (error) {
        setMessage(`Record created, but the table could not refresh: ${error.message}`, "error");
      }
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest("tr");
    const id = button.dataset.editId || button.dataset.saveId || button.dataset.cancelId || button.dataset.deleteId;
    if (!id) return;

    if (button.dataset.editId) {
      const editingRow = renderEditingRow(records.get(String(id)));
      row.replaceWith(editingRow);
      editingRow.querySelector("input, select, textarea")?.focus();
      return;
    }

    if (button.dataset.cancelId) {
      row.replaceWith(renderRow(records.get(String(id))));
      setMessage("Changes discarded.", "success");
      return;
    }

    if (button.dataset.saveId) {
      if (![...row.querySelectorAll("input, select, textarea")].every((control) => control.reportValidity())) return;
      const payload = readRowPayload(row);
      const validationError = validatePayload(payload);
      if (validationError) {
        setMessage(validationError, "error");
        return;
      }

      row.querySelectorAll("button, input, select, textarea").forEach((control) => { control.disabled = true; });
      row.setAttribute("aria-busy", "true");
      button.textContent = "Saving...";
      try {
        const updatedRecord = await parseResponse(await fetch(`${definition.endpoint}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));
        setMessage(definition.success);
        try {
          await loadRecords();
        } catch (error) {
          const record = { ...records.get(String(id)), ...updatedRecord };
          if (moduleName === "requests") {
            record.resident_name = residents.find((resident) => String(resident.id) === String(record.resident_id))?.full_name;
          }
          row.replaceWith(renderRow(record));
          setMessage(`Changes were saved, but the table could not refresh: ${error.message}`, "error");
        }
      } catch (error) {
        setMessage(error.message, "error");
        row.querySelectorAll("button, input, select, textarea").forEach((control) => { control.disabled = false; });
        row.removeAttribute("aria-busy");
        const save = row.querySelector("[data-save-id]");
        if (save) save.textContent = "Save";
      }
      return;
    }

    if (button.dataset.deleteId) {
      const confirmed = await confirmDelete();
      if (!confirmed) return;
      button.disabled = true;
      button.textContent = "Deleting...";
      try {
        await parseResponse(await fetch(`${definition.endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" }));
        setMessage("Record deleted successfully.");
        try {
          await loadRecords();
        } catch (error) {
          row.remove();
          setMessage(`Record deleted, but the table could not refresh: ${error.message}`, "error");
        }
      } catch (error) {
        button.disabled = false;
        button.textContent = "Delete";
        setMessage(error.message, "error");
      }
    }
  });

  const confirmDelete = () => new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "delete-dialog-title");
    const title = document.createElement("h2");
    title.id = "delete-dialog-title";
    title.textContent = "Delete this record?";
    const description = document.createElement("p");
    description.textContent = "This action cannot be undone.";
    const controls = document.createElement("form");
    controls.method = "dialog";
    const cancel = createDialogButton("Cancel", "cancel");
    const remove = createDialogButton("Delete", "confirm");
    remove.className = "danger";
    controls.append(cancel, remove);
    dialog.append(title, description, controls);
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm");
      dialog.remove();
    }, { once: true });
    dialog.showModal();
  });

  function createDialogButton(label, value) {
    const button = document.createElement("button");
    button.type = "submit";
    button.value = value;
    button.textContent = label;
    return button;
  }

  if (definition.paginated) {
    const searchInput = document.getElementById("search-input");
    let searchTimeout;
    const searchRecords = () => {
      searchQuery = searchInput.value.trim();
      currentPage = 1;
      loadRecords().catch((error) => setMessage(error.message, "error"));
    };
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(searchRecords, 1000);
    });
    document.getElementById("prev-page").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        loadRecords().catch((error) => setMessage(error.message, "error"));
      }
    });
    document.getElementById("next-page").addEventListener("click", () => {
      if (currentPage < lastPage) {
        currentPage += 1;
        loadRecords().catch((error) => setMessage(error.message, "error"));
      }
    });
  }

  Promise.all([moduleName === "requests" ? loadResidents() : Promise.resolve(), loadRecords()])
    .catch((error) => setMessage(error.message, "error"));
}
