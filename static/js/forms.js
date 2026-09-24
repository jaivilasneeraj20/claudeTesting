/* =====================================================================
   forms.js — one "add / edit" form for every table.
   To add a new field: add one line here (and the column in db.py).
   Format: [field, label, type, options]
   type = "text" | "email" | "tel" | "number" | "date" | "textarea" | list of choices | "ref:<table>"
   ===================================================================== */

const FORMS = {
  contacts: {
    title: "Contact", icon: "user-plus",
    fields: [
      ["name", "Full name", "text", { required: true }],
      ["email", "Email", "email"],
      ["phone", "Phone", "tel"],
      ["company_id", "Company", "ref:companies"],
      ["status", "Status", Object.keys(STATUS)],
      ["source", "Source", SOURCES],
    ],
  },
  companies: {
    title: "Company", icon: "building-2",
    fields: [
      ["name", "Company name", "text", { required: true }],
      ["industry", "Industry", INDUSTRIES],
      ["website", "Website", "text"],
      ["phone", "Phone", "tel"],
      ["city", "City", "text", { full: true }],
    ],
  },
  deals: {
    title: "Deal", icon: "briefcase",
    fields: [
      ["title", "Deal title", "text", { required: true, full: true }],
      ["value", "Value (₹)", "number"],
      ["stage", "Stage", Object.keys(STAGES)],
      ["contact_id", "Contact", "ref:contacts"],
      ["company_id", "Company", "ref:companies"],
      ["close_date", "Expected close date", "date", { full: true }],
    ],
  },
  tasks: {
    title: "Task", icon: "check-circle-2",
    fields: [
      ["title", "What needs to be done?", "text", { required: true, full: true }],
      ["due_date", "Due date", "date"],
      ["priority", "Priority", Object.keys(PRIORITY), { default: "Medium" }],
      ["contact_id", "Related contact", "ref:contacts", { full: true }],
    ],
  },
  activities: {
    title: "Activity", icon: "activity",
    fields: [
      ["type", "Type", ["Call", "Email", "Meeting", "WhatsApp", "Note"]],
      ["contact_id", "Contact", "ref:contacts"],
      ["note", "What happened?", "textarea", { required: true, full: true }],
    ],
  },
};

function fieldHtml([key, label, type, opt = {}], value) {
  value = value ?? opt.default ?? "";
  let input;
  if (Array.isArray(type)) {
    input = `<select name="${key}">${type.map((o) => `<option ${o === value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  } else if (type.startsWith("ref:")) {
    const rows = state.data[type.slice(4)];
    input = `<select name="${key}"><option value="">— None —</option>${rows
      .map((r) => `<option value="${r.id}" ${r.id === value ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    input = `<textarea name="${key}" ${opt.required ? "required" : ""}>${esc(value)}</textarea>`;
  } else {
    input = `<input name="${key}" type="${type}" value="${esc(value)}" ${opt.required ? "required" : ""} ${type === "number" ? 'min="0" step="any"' : ""}>`;
  }
  return `<label class="${opt.full ? "full" : ""}">${label}${input}</label>`;
}

// Open the add/edit form. `preset` pre-fills fields, e.g. { due_date: "2026-10-01" }.
function openForm(table, id = null, preset = {}) {
  const form = FORMS[table];
  const row = id ? find(table, id) : preset;
  openModal(`
    <form id="crmForm">
      <div class="modal-head">
        <h3><span class="ico"><i data-lucide="${form.icon}"></i></span>${id ? "Edit" : "New"} ${form.title}</h3>
        <button type="button" class="icon-btn" onclick="closeModal()"><i data-lucide="x"></i></button>
      </div>
      <div class="form-grid">${form.fields.map((f) => fieldHtml(f, row[f[0]])).join("")}</div>
      <div class="modal-foot">
        ${id ? `<button type="button" class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="removeRow('${table}', ${id})"><i data-lucide="trash-2"></i>Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i data-lucide="check"></i>Save</button>
      </div>
    </form>`);
  setTimeout(() => $("#crmForm input, #crmForm textarea")?.focus(), 60);

  $("#crmForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if ("value" in data) data.value = Number(data.value) || 0;
    const oldStage = id ? row.stage : null;
    try {
      await api(id ? `${table}/${id}` : table, id ? "PUT" : "POST", data);
      closeModal();
      if (table === "deals" && data.stage === "Won" && oldStage !== "Won") celebrate(data.title);
      else toast(`${form.title} ${id ? "updated" : "added"}`);
      await refresh();
    } catch (err) {
      toast(err.message, "err");
    }
  };
}

async function removeRow(table, id) {
  const yes = await askConfirm(`Delete this ${FORMS[table].title.toLowerCase()}?`, "This cannot be undone.");
  if (!yes) return;
  await api(`${table}/${id}`, "DELETE");
  toast(`${FORMS[table].title} deleted`);
  closeDrawer();
  await refresh();
}

function celebrate(title) {
  confetti();
  toast(`Deal won: ${title}! 🎉`, "win");
}
