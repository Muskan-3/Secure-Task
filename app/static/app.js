"use strict";

// SecureTask front end. All user-provided text is rendered with textContent /
// createElement only, never innerHTML, so it can't be interpreted as HTML (XSS).

const TOKEN_KEY = "securetask.token";
const EMAIL_KEY = "securetask.email";

const $ = (id) => document.getElementById(id);

const els = {
  authView: $("auth-view"),
  tasksView: $("tasks-view"),
  tabLogin: $("tab-login"),
  tabRegister: $("tab-register"),
  authForm: $("auth-form"),
  authEmail: $("auth-email"),
  authPassword: $("auth-password"),
  passwordHint: $("password-hint"),
  authError: $("auth-error"),
  authSubmit: $("auth-submit"),
  userEmail: $("user-email"),
  logoutBtn: $("logout-btn"),
  addForm: $("add-form"),
  taskTitle: $("task-title"),
  taskDesc: $("task-desc"),
  addError: $("add-error"),
  addSubmit: $("add-submit"),
  counter: $("task-counter"),
  loading: $("tasks-loading"),
  empty: $("empty-state"),
  list: $("task-list"),
  toasts: $("toasts"),
};

let authMode = "login";
let tasks = [];

/* ---------------- Storage (localStorage can throw in private modes) ---------------- */

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) { /* ignore */ }
}

function load(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

/* ---------------- API helper ---------------- */

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

// auth: true  -> send the Bearer token, and treat 401 as "session ended"
// auth: false -> public endpoints (login/register), where 401 is a normal answer
async function api(path, { method = "GET", json, form, auth = true } = {}) {
  const headers = {};
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (auth) {
    const token = load(TOKEN_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(path, { method, headers, body });
  } catch (_) {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && auth) {
    endSession("Your session has ended. Please log in again.");
    throw new ApiError(401, "Not authenticated");
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }
  if (!res.ok) {
    throw new ApiError(res.status, data && data.detail !== undefined ? data.detail : data);
  }
  return data;
}

/* ---------------- Toasts ---------------- */

const MAX_TOASTS = 3;

function toast(message, type = "success") {
  while (els.toasts.children.length >= MAX_TOASTS) els.toasts.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  els.toasts.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ---------------- Small UI helpers ---------------- */

function setLoading(button, loading, loadingText) {
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = loadingText;
    button.classList.add("is-loading");
    button.disabled = true;
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.classList.remove("is-loading");
    button.disabled = false;
  }
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

/* ---------------- Views ---------------- */

function showAuth() {
  els.tasksView.hidden = true;
  els.authView.hidden = false;
  document.title = "SecureTask - Log in";
  els.authEmail.focus();
}

function showTasks() {
  els.authView.hidden = true;
  els.tasksView.hidden = false;
  els.userEmail.textContent = load(EMAIL_KEY) || "";
  document.title = "SecureTask";
  loadTasks();
}

function endSession(message) {
  store(TOKEN_KEY, null);
  store(EMAIL_KEY, null);
  tasks = [];
  els.list.replaceChildren();
  if (message) toast(message, "error");
  showAuth();
}

/* ---------------- Auth ---------------- */

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  els.tabLogin.setAttribute("aria-selected", String(isLogin));
  els.tabRegister.setAttribute("aria-selected", String(!isLogin));
  els.authSubmit.textContent = isLogin ? "Log in" : "Create account";
  els.authPassword.autocomplete = isLogin ? "current-password" : "new-password";
  els.passwordHint.hidden = isLogin;
  showError(els.authError, "");
  els.authEmail.removeAttribute("aria-invalid");
  els.authPassword.removeAttribute("aria-invalid");
}

// Turn API error responses into friendly sentences.
function friendlyAuthError(err) {
  if (err.status === 0) return err.message;
  if (authMode === "login" && err.status === 401) return "Incorrect email or password.";
  if (authMode === "register" && err.status === 400) {
    return "That email is already registered. Try logging in instead.";
  }
  if (err.status === 422 && Array.isArray(err.detail)) {
    const issue = err.detail[0] || {};
    const field = Array.isArray(issue.loc) ? issue.loc[issue.loc.length - 1] : "";
    if (field === "email" || field === "username") return "Please enter a valid email address.";
    if (field === "password") {
      if (issue.type === "string_too_short") return "Password must be at least 8 characters.";
      return issue.msg || "That password isn't allowed.";
    }
  }
  return "Something went wrong. Please try again.";
}

function validateAuthForm(email, password) {
  els.authEmail.removeAttribute("aria-invalid");
  els.authPassword.removeAttribute("aria-invalid");
  if (!email || !els.authEmail.checkValidity()) {
    els.authEmail.setAttribute("aria-invalid", "true");
    return "Please enter a valid email address.";
  }
  if (!password) {
    els.authPassword.setAttribute("aria-invalid", "true");
    return "Please enter your password.";
  }
  if (authMode === "register" && password.length < 8) {
    els.authPassword.setAttribute("aria-invalid", "true");
    return "Password must be at least 8 characters.";
  }
  return "";
}

async function logIn(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    form: { username: email, password },
    auth: false,
  });
  store(TOKEN_KEY, data.access_token);
  store(EMAIL_KEY, email);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = els.authEmail.value.trim().toLowerCase();
  const password = els.authPassword.value;

  const problem = validateAuthForm(email, password);
  showError(els.authError, problem);
  if (problem) return;

  const registering = authMode === "register";
  setLoading(els.authSubmit, true, registering ? "Creating account…" : "Logging in…");
  try {
    if (registering) {
      await api("/auth/register", { method: "POST", json: { email, password }, auth: false });
    }
    await logIn(email, password);
    els.authForm.reset();
    toast(registering ? "Account created - welcome!" : "Welcome back!");
    showTasks();
  } catch (err) {
    showError(els.authError, friendlyAuthError(err));
    if (err.status === 401 || err.status === 400) els.authPassword.select();
  } finally {
    setLoading(els.authSubmit, false);
  }
}

/* ---------------- Tasks ---------------- */

async function loadTasks() {
  els.loading.hidden = false;
  els.empty.hidden = true;
  try {
    tasks = await api("/tasks");
    render();
  } catch (err) {
    if (err.status !== 401) toast("Couldn't load your tasks.", "error");
  } finally {
    els.loading.hidden = true;
  }
}

function updateCounter() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  els.counter.textContent = total === 0 ? "" : `${total} ${total === 1 ? "task" : "tasks"}, ${done} completed`;
}

function render() {
  updateCounter();
  els.empty.hidden = tasks.length !== 0;
  // Newest first
  const items = [...tasks].sort((a, b) => b.id - a.id).map(renderTask);
  els.list.replaceChildren(...items);
}

function makeButton(label, className, onClick, ariaLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn btn-small ${className}`;
  btn.textContent = label;
  if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderTask(task) {
  const li = document.createElement("li");
  li.className = "task" + (task.completed ? " done" : "");
  li.dataset.id = String(task.id);

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "task-check";
  check.checked = task.completed;
  check.setAttribute("aria-label", `Mark "${task.title}" as ${task.completed ? "not completed" : "completed"}`);
  check.addEventListener("change", () => toggleTask(task, check));

  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;
  body.appendChild(title);

  if (task.description) {
    const desc = document.createElement("div");
    desc.className = "task-desc";
    desc.textContent = task.description;
    body.appendChild(desc);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(
    makeButton("Edit", "btn-ghost", () => startEdit(task, li), `Edit "${task.title}"`),
    makeButton("Delete", "btn-danger-ghost", (e) => deleteTask(task, e.currentTarget), `Delete "${task.title}"`),
  );

  li.append(check, body, actions);
  return li;
}

async function handleAddSubmit(event) {
  event.preventDefault();
  const title = els.taskTitle.value.trim();
  const description = els.taskDesc.value.trim();

  if (!title) {
    showError(els.addError, "Please give your task a title.");
    els.taskTitle.focus();
    return;
  }
  showError(els.addError, "");

  setLoading(els.addSubmit, true, "Adding…");
  try {
    const created = await api("/tasks", {
      method: "POST",
      json: { title, description: description || null },
    });
    tasks.push(created);
    render();
    els.addForm.reset();
    els.taskTitle.focus();
    toast("Task added");
  } catch (err) {
    if (err.status !== 401) showError(els.addError, err.status === 0 ? err.message : "Couldn't add the task. Please try again.");
  } finally {
    setLoading(els.addSubmit, false);
  }
}

function replaceTask(updated) {
  const i = tasks.findIndex((t) => t.id === updated.id);
  if (i !== -1) tasks[i] = updated;
}

async function toggleTask(task, checkbox) {
  checkbox.disabled = true;
  try {
    const updated = await api(`/tasks/${task.id}`, { method: "PUT", json: { completed: checkbox.checked } });
    replaceTask(updated);
    render();
    toast(updated.completed ? "Marked as completed" : "Marked as not completed");
  } catch (err) {
    checkbox.checked = !checkbox.checked;
    checkbox.disabled = false;
    if (err.status === 404) { toast("That task no longer exists.", "error"); loadTasks(); }
    else if (err.status !== 401) toast("Couldn't update the task.", "error");
  }
}

function startEdit(task, li) {
  const body = li.querySelector(".task-body");
  const actions = li.querySelector(".task-actions");
  actions.hidden = true;

  const row = document.createElement("form");
  row.className = "edit-row";
  row.noValidate = true;

  const input = document.createElement("input");
  input.type = "text";
  input.value = task.title;
  input.maxLength = 200;
  input.setAttribute("aria-label", "Task title");

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn btn-small btn-primary";
  save.textContent = "Save";

  const cancel = makeButton("Cancel", "btn-ghost", () => render());

  row.append(input, save, cancel);
  body.replaceChildren(row);
  input.focus();
  input.select();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") render();
  });

  row.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newTitle = input.value.trim();
    if (!newTitle) {
      input.setAttribute("aria-invalid", "true");
      toast("Title can't be empty.", "error");
      return;
    }
    if (newTitle === task.title) { render(); return; }

    setLoading(save, true, "Saving…");
    try {
      const updated = await api(`/tasks/${task.id}`, { method: "PUT", json: { title: newTitle } });
      replaceTask(updated);
      render();
      toast("Task updated");
    } catch (err) {
      setLoading(save, false);
      if (err.status === 404) { toast("That task no longer exists.", "error"); loadTasks(); }
      else if (err.status !== 401) toast("Couldn't save the task.", "error");
    }
  });
}

async function deleteTask(task, button) {
  setLoading(button, true, "Deleting…");
  try {
    await api(`/tasks/${task.id}`, { method: "DELETE" });
    tasks = tasks.filter((t) => t.id !== task.id);
    render();
    toast("Task deleted");
  } catch (err) {
    if (err.status === 404) { tasks = tasks.filter((t) => t.id !== task.id); render(); toast("That task was already gone.", "error"); }
    else if (err.status !== 401) { setLoading(button, false); toast("Couldn't delete the task.", "error"); }
  }
}

/* ---------------- Wire up ---------------- */

els.tabLogin.addEventListener("click", () => setAuthMode("login"));
els.tabRegister.addEventListener("click", () => setAuthMode("register"));
els.authForm.addEventListener("submit", handleAuthSubmit);
els.addForm.addEventListener("submit", handleAddSubmit);
els.logoutBtn.addEventListener("click", () => {
  endSession();
  setAuthMode("login");
  toast("You've been logged out");
});

setAuthMode("login");
if (load(TOKEN_KEY)) showTasks();
else showAuth();
