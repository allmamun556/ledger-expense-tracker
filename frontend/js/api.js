/* ============================================================
   Ledger — API client
   Change API_BASE if your backend runs somewhere other than
   http://127.0.0.1:8000
   ============================================================ */

const API_BASE = window.LEDGER_API_BASE || "http://127.0.0.1:8000";

const TOKEN_KEY = "ledger_token";
const USER_KEY = "ledger_user";

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  requireAuthOrRedirect() {
    if (!this.isLoggedIn()) {
      window.location.href = "login.html";
    }
  },
  redirectIfLoggedIn() {
    if (this.isLoggedIn()) {
      window.location.href = "index.html";
    }
  },
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiRequest(path, { method = "GET", body, auth = true, isFormEncoded = false } = {}) {
  const headers = {};
  if (body && !isFormEncoded) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = Auth.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isFormEncoded ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    throw new ApiError(
      "Can't reach the server. Is the FastAPI backend running at " + API_BASE + "?",
      0
    );
  }

  if (res.status === 401 && auth) {
    Auth.clear();
    window.location.href = "login.html?expired=1";
    return;
  }

  if (res.status === 204) return null;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }

  return data;
}

const Api = {
  // Auth
  signup: (payload) => apiRequest("/api/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (payload) => apiRequest("/api/auth/login", { method: "POST", body: payload, auth: false }),
  googleLogin: (credential) =>
    apiRequest("/api/auth/google", { method: "POST", body: { credential }, auth: false }),
  me: () => apiRequest("/api/auth/me"),
  updateMe: (payload) => apiRequest("/api/auth/me", { method: "PATCH", body: payload }),
  changePassword: (payload) => apiRequest("/api/auth/change-password", { method: "POST", body: payload }),

  // Categories
  listCategories: () => apiRequest("/api/categories"),
  createCategory: (payload) => apiRequest("/api/categories", { method: "POST", body: payload }),
  updateCategory: (id, payload) => apiRequest(`/api/categories/${id}`, { method: "PATCH", body: payload }),
  deleteCategory: (id) => apiRequest(`/api/categories/${id}`, { method: "DELETE" }),

  // Expenses
  listExpenses: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    ).toString();
    return apiRequest(`/api/expenses${qs ? `?${qs}` : ""}`);
  },
  createExpense: (payload) => apiRequest("/api/expenses", { method: "POST", body: payload }),
  updateExpense: (id, payload) => apiRequest(`/api/expenses/${id}`, { method: "PATCH", body: payload }),
  deleteExpense: (id) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
  exportExpenses: async (format, params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    ).toString();
    const res = await fetch(`${API_BASE}/api/expenses/export.${format}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${Auth.getToken()}` },
    });
    if (!res.ok) throw new ApiError(`Export failed (${res.status})`, res.status);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_export.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Reports
  summary: () => apiRequest("/api/reports/summary"),
  dailyTotals: (dateFrom, dateTo) => apiRequest(`/api/reports/daily?date_from=${dateFrom}&date_to=${dateTo}`),
  monthlyTotals: (months = 6) => apiRequest(`/api/reports/monthly?months=${months}`),
  byCategory: (dateFrom, dateTo) => apiRequest(`/api/reports/by-category?date_from=${dateFrom}&date_to=${dateTo}`),
  listBudgets: () => apiRequest("/api/reports/budgets"),
  upsertBudget: (payload) => apiRequest("/api/reports/budgets", { method: "POST", body: payload }),
  deleteBudget: (id) => apiRequest(`/api/reports/budgets/${id}`, { method: "DELETE" }),
};
