Auth.requireAuthOrRedirect();

const state = {
  user: Auth.getUser(),
  categories: [],
  expenses: { items: [], total: 0, page: 1, page_size: 10 },
  filters: { search: "", category_id: "", date_from: "", date_to: "", sort_by: "date", sort_dir: "desc" },
  editingExpenseId: null,
  editingCategoryId: null,
};

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.getElementById("sidebar").classList.remove("mobile-open");

  if (name === "dashboard") loadDashboard();
  if (name === "expenses") loadExpensesView();
  if (name === "categories") loadCategoriesView();
  if (name === "budgets") loadBudgetsView();
  if (name === "settings") loadSettingsView();
}

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.goto));
});

document.getElementById("mobile-menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("mobile-open");
});

// ---------------------------------------------------------------
// User chip / logout
// ---------------------------------------------------------------
function renderUserChip() {
  const u = state.user;
  if (!u) return;
  document.getElementById("user-name").textContent = u.full_name || u.email;
  document.getElementById("user-email").textContent = u.email;
  document.getElementById("greeting-name").textContent = (u.full_name || u.email).split(" ")[0];

  const img = document.getElementById("user-avatar-img");
  const fallback = document.getElementById("user-avatar-fallback");
  if (u.avatar_url) {
    img.src = u.avatar_url;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    fallback.textContent = initialsFrom(u.full_name || u.email);
    fallback.classList.remove("hidden");
    img.classList.add("hidden");
  }
}

function logout() {
  Auth.clear();
  window.location.href = "login.html";
}
document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("settings-logout-btn").addEventListener("click", logout);

// ---------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------
function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });
});

// ---------------------------------------------------------------
// Categories (shared across views)
// ---------------------------------------------------------------
async function loadCategories() {
  state.categories = await Api.listCategories();
  populateCategoryFilter();
  populateCategoryPicker();
  populateBudgetCategorySelect();
}

function populateCategoryFilter() {
  const sel = document.getElementById("filter-category");
  const current = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' +
    state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = current;
}

function populateCategoryPicker() {
  const picker = document.getElementById("expense-category-picker");
  picker.innerHTML = state.categories
    .map((c) => `<button type="button" class="chip" data-id="${c.id}" style="--dot:${c.color}">${escapeHtml(c.name)}</button>`)
    .join("");
  picker.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      picker.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      picker.dataset.selectedId = chip.dataset.id;
    });
  });
}

function populateBudgetCategorySelect() {
  const sel = document.getElementById("budget-category");
  sel.innerHTML = state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function categoryPill(category) {
  if (!category) return `<span class="cat-pill"><span class="dot" style="background:#6B7280"></span>Uncategorized</span>`;
  return `<span class="cat-pill"><span class="dot" style="background:${category.color}"></span>${escapeHtml(category.name)}</span>`;
}

// ---------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------
async function loadDashboard() {
  document.getElementById("dashboard-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  try {
    const [summary, monthly, recent] = await Promise.all([
      Api.summary(),
      Api.monthlyTotals(6),
      Api.listExpenses({ page: 1, page_size: 6, sort_by: "date", sort_dir: "desc" }),
    ]);

    const cur = state.user.currency;
    document.getElementById("stat-today").textContent = formatMoney(summary.today_total, cur);
    document.getElementById("stat-week").textContent = formatMoney(summary.this_week_total, cur);
    document.getElementById("stat-month").textContent = formatMoney(summary.this_month_total, cur);

    const deltaEl = document.getElementById("stat-month-delta");
    if (summary.month_over_month_change_pct === null || summary.month_over_month_change_pct === undefined) {
      deltaEl.textContent = "No data for last month yet";
      deltaEl.className = "delta flat";
    } else {
      const pct = summary.month_over_month_change_pct;
      deltaEl.textContent = `${pct > 0 ? "↑" : pct < 0 ? "↓" : "→"} ${Math.abs(pct)}% vs last month`;
      deltaEl.className = "delta " + (pct > 0 ? "up" : pct < 0 ? "down" : "flat");
    }

    const budgetStatEl = document.getElementById("stat-budget");
    if (summary.monthly_budget > 0) {
      budgetStatEl.innerHTML = formatMoney(summary.monthly_budget_remaining, cur) + `<small>of ${formatMoney(summary.monthly_budget, cur)}</small>`;
      budgetStatEl.style.color = summary.monthly_budget_remaining < 0 ? "var(--brick)" : "var(--ink)";
    } else {
      budgetStatEl.innerHTML = `<small style="font-family:var(--font-body);">Not set</small>`;
    }

    renderMonthlyChart(
      "chart-monthly",
      monthly.map((m) => {
        const [y, mo] = m.month.split("-");
        return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: "short" });
      }),
      monthly.map((m) => m.total),
      cur
    );

    const today = todayIso();
    const monthStart = firstDayOfMonthIso();
    const byCat = await Api.byCategory(monthStart, today);
    document.getElementById("donut-sub").textContent = byCat.length ? `${byCat.length} categories` : "No spending yet this month";
    renderCategoryChart(
      "chart-category",
      byCat.map((c) => c.category_name),
      byCat.map((c) => c.total),
      byCat.map((c) => c.color),
      cur
    );

    const body = document.getElementById("recent-expenses-body");
    const emptyEl = document.getElementById("recent-empty");
    if (recent.items.length === 0) {
      body.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      body.innerHTML = recent.items
        .map(
          (e) => `<tr>
            <td>${formatDate(e.date)}</td>
            <td>${escapeHtml(e.description || "—")}</td>
            <td>${categoryPill(e.category)}</td>
            <td class="amount">${formatMoney(e.amount, cur)}</td>
          </tr>`
        )
        .join("");
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("open-add-expense-dash").addEventListener("click", () => openExpenseModal());

// ---------------------------------------------------------------
// Expenses view
// ---------------------------------------------------------------
async function loadExpensesView() {
  const cur = state.user.currency;
  const [sortBy, sortDir] = document.getElementById("filter-sort").value.split("-");
  const params = {
    page: state.expenses.page,
    page_size: state.expenses.page_size,
    search: state.filters.search || undefined,
    category_id: state.filters.category_id || undefined,
    date_from: state.filters.date_from || undefined,
    date_to: state.filters.date_to || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
  };

  try {
    const data = await Api.listExpenses(params);
    state.expenses = { ...state.expenses, ...data };

    const body = document.getElementById("expenses-body");
    const emptyEl = document.getElementById("expenses-empty");
    if (data.items.length === 0) {
      body.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      body.innerHTML = data.items
        .map(
          (e) => `<tr>
            <td>${formatDate(e.date)}</td>
            <td>${escapeHtml(e.description || "—")}${e.notes ? `<div style="font-size:12px;color:var(--slate);margin-top:2px;">${escapeHtml(e.notes)}</div>` : ""}</td>
            <td>${categoryPill(e.category)}</td>
            <td style="text-transform:capitalize;color:var(--slate);font-size:13.5px;">${e.payment_method.replace("_", " ")}</td>
            <td class="amount">${formatMoney(e.amount, cur)}</td>
            <td class="actions">
              <button data-edit="${e.id}" title="Edit">✎</button>
              <button data-delete="${e.id}" class="danger" title="Delete">🗑</button>
            </td>
          </tr>`
        )
        .join("");

      body.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => openExpenseModal(Number(b.dataset.edit)))
      );
      body.querySelectorAll("[data-delete]").forEach((b) =>
        b.addEventListener("click", () => deleteExpense(Number(b.dataset.delete)))
      );
    }

    const start = data.total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
    const end = Math.min(data.page * data.page_size, data.total);
    document.getElementById("pagination-info").textContent = `${start}–${end} of ${data.total}`;
    document.getElementById("prev-page").disabled = data.page <= 1;
    document.getElementById("next-page").disabled = end >= data.total;
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("filter-search").addEventListener(
  "input",
  debounce((e) => {
    state.filters.search = e.target.value;
    state.expenses.page = 1;
    loadExpensesView();
  }, 350)
);
document.getElementById("filter-category").addEventListener("change", (e) => {
  state.filters.category_id = e.target.value;
  state.expenses.page = 1;
  loadExpensesView();
});
document.getElementById("filter-from").addEventListener("change", (e) => {
  state.filters.date_from = e.target.value;
  state.expenses.page = 1;
  loadExpensesView();
});
document.getElementById("filter-to").addEventListener("change", (e) => {
  state.filters.date_to = e.target.value;
  state.expenses.page = 1;
  loadExpensesView();
});
document.getElementById("filter-sort").addEventListener("change", () => loadExpensesView());
document.getElementById("prev-page").addEventListener("click", () => {
  if (state.expenses.page > 1) {
    state.expenses.page -= 1;
    loadExpensesView();
  }
});
document.getElementById("next-page").addEventListener("click", () => {
  state.expenses.page += 1;
  loadExpensesView();
});

function currentExportParams() {
  return {
    category_id: state.filters.category_id || undefined,
    date_from: state.filters.date_from || undefined,
    date_to: state.filters.date_to || undefined,
  };
}
document.getElementById("export-csv-btn").addEventListener("click", () => {
  const format = document.getElementById("export-format").value;
  Api.exportExpenses(format, currentExportParams()).catch((err) => alert(err.message));
});
document.getElementById("settings-export-btn").addEventListener("click", () => {
  const format = document.getElementById("settings-export-format").value;
  Api.exportExpenses(format, {}).catch((err) => alert(err.message));
});

document.getElementById("open-add-expense-list").addEventListener("click", () => openExpenseModal());

async function deleteExpense(id) {
  if (!confirm("Delete this expense? This can't be undone.")) return;
  try {
    await Api.deleteExpense(id);
    toast("Expense deleted", "success");
    loadExpensesView();
    if (document.getElementById("view-dashboard").classList.contains("active")) loadDashboard();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---------------------------------------------------------------
// Expense modal (create / edit)
// ---------------------------------------------------------------
function openExpenseModal(expenseId = null) {
  state.editingExpenseId = expenseId;
  document.getElementById("expense-error").textContent = "";
  const picker = document.getElementById("expense-category-picker");
  picker.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
  delete picker.dataset.selectedId;

  if (expenseId) {
    const expense = state.expenses.items.find((e) => e.id === expenseId);
    document.getElementById("expense-modal-title").textContent = "Edit expense";
    document.getElementById("expense-submit-btn").textContent = "Save changes";
    document.getElementById("expense-id").value = expense.id;
    document.getElementById("expense-amount").value = expense.amount;
    document.getElementById("expense-date").value = expense.date;
    document.getElementById("expense-description").value = expense.description || "";
    document.getElementById("expense-payment").value = expense.payment_method;
    document.getElementById("expense-recurring").value = String(expense.is_recurring);
    document.getElementById("expense-notes").value = expense.notes || "";
    if (expense.category_id) {
      const chip = picker.querySelector(`.chip[data-id="${expense.category_id}"]`);
      if (chip) {
        chip.classList.add("selected");
        picker.dataset.selectedId = expense.category_id;
      }
    }
  } else {
    document.getElementById("expense-modal-title").textContent = "Add expense";
    document.getElementById("expense-submit-btn").textContent = "Save expense";
    document.getElementById("expense-form").reset();
    document.getElementById("expense-id").value = "";
    document.getElementById("expense-date").value = todayIso();
  }
  openModal("expense-modal-overlay");
}

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("expense-error");
  errorEl.textContent = "";
  const picker = document.getElementById("expense-category-picker");

  const payload = {
    amount: parseFloat(document.getElementById("expense-amount").value),
    date: document.getElementById("expense-date").value,
    description: document.getElementById("expense-description").value.trim() || null,
    payment_method: document.getElementById("expense-payment").value,
    is_recurring: document.getElementById("expense-recurring").value === "true",
    notes: document.getElementById("expense-notes").value.trim() || null,
    category_id: picker.dataset.selectedId ? Number(picker.dataset.selectedId) : null,
  };

  try {
    if (state.editingExpenseId) {
      await Api.updateExpense(state.editingExpenseId, payload);
      toast("Expense updated", "success");
    } else {
      await Api.createExpense(payload);
      toast("Expense added", "success");
    }
    closeModal("expense-modal-overlay");
    if (document.getElementById("view-expenses").classList.contains("active")) loadExpensesView();
    if (document.getElementById("view-dashboard").classList.contains("active")) loadDashboard();
    if (document.getElementById("view-budgets").classList.contains("active")) loadBudgetsView();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------------------------------------------------------------
// Categories view
// ---------------------------------------------------------------
async function loadCategoriesView() {
  await loadCategories();
  const cur = state.user.currency;
  const monthStart = firstDayOfMonthIso();
  const today = todayIso();

  let spendByCategory = {};
  try {
    const byCat = await Api.byCategory(monthStart, today);
    byCat.forEach((c) => { if (c.category_id) spendByCategory[c.category_id] = c.total; });
  } catch (_) {}

  const grid = document.getElementById("category-grid");
  grid.innerHTML = state.categories
    .map(
      (c) => `<div class="category-card">
        <div class="swatch" style="background:${c.color}"></div>
        <div class="info">
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="spend">${formatMoney(spendByCategory[c.id] || 0, cur)} this month</div>
        </div>
        <div class="cat-actions">
          <button data-edit-cat="${c.id}" title="Edit">✎</button>
          <button data-delete-cat="${c.id}" title="Delete">🗑</button>
        </div>
      </div>`
    )
    .join("");

  grid.querySelectorAll("[data-edit-cat]").forEach((b) =>
    b.addEventListener("click", () => openCategoryModal(Number(b.dataset.editCat)))
  );
  grid.querySelectorAll("[data-delete-cat]").forEach((b) =>
    b.addEventListener("click", () => deleteCategory(Number(b.dataset.deleteCat)))
  );
}

document.getElementById("open-add-category").addEventListener("click", () => openCategoryModal());

function openCategoryModal(categoryId = null) {
  state.editingCategoryId = categoryId;
  document.getElementById("category-error").textContent = "";
  if (categoryId) {
    const cat = state.categories.find((c) => c.id === categoryId);
    document.getElementById("category-modal-title").textContent = "Edit category";
    document.getElementById("category-id").value = cat.id;
    document.getElementById("category-name").value = cat.name;
    document.getElementById("category-color").value = cat.color;
  } else {
    document.getElementById("category-modal-title").textContent = "New category";
    document.getElementById("category-form").reset();
    document.getElementById("category-id").value = "";
    document.getElementById("category-color").value = "#B5652B";
  }
  openModal("category-modal-overlay");
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("category-error");
  errorEl.textContent = "";
  const payload = {
    name: document.getElementById("category-name").value.trim(),
    color: document.getElementById("category-color").value,
    icon: "tag",
  };
  try {
    if (state.editingCategoryId) {
      await Api.updateCategory(state.editingCategoryId, payload);
      toast("Category updated", "success");
    } else {
      await Api.createCategory(payload);
      toast("Category created", "success");
    }
    closeModal("category-modal-overlay");
    await loadCategoriesView();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function deleteCategory(id) {
  if (!confirm("Delete this category? Expenses in it will become uncategorized.")) return;
  try {
    await Api.deleteCategory(id);
    toast("Category deleted", "success");
    await loadCategoriesView();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---------------------------------------------------------------
// Budgets view
// ---------------------------------------------------------------
async function loadBudgetsView() {
  await loadCategories();
  const cur = state.user.currency;
  const monthStart = firstDayOfMonthIso();
  const today = todayIso();

  try {
    const [budgets, byCat] = await Promise.all([Api.listBudgets(), Api.byCategory(monthStart, today)]);
    const spendMap = {};
    byCat.forEach((c) => { if (c.category_id) spendMap[c.category_id] = c.total; });

    const list = document.getElementById("budgets-list");
    const emptyEl = document.getElementById("budgets-empty");

    if (budgets.length === 0) {
      list.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    list.innerHTML = budgets
      .map((b) => {
        const spent = spendMap[b.category_id] || 0;
        const pct = Math.min(100, Math.round((spent / b.limit_amount) * 100));
        const over = spent > b.limit_amount;
        const cat = b.category;
        return `<div class="budget-row">
          <div class="top">
            <div class="cat">
              ${cat ? `<span class="dot" style="width:9px;height:9px;border-radius:50%;background:${cat.color};display:inline-block;"></span>` : ""}
              ${escapeHtml(cat ? cat.name : "Category")}
            </div>
            <div class="figures">${formatMoney(spent, cur)} / ${formatMoney(b.limit_amount, cur)}</div>
          </div>
          <div class="budget-bar"><div class="fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
          <div style="text-align:right;margin-top:8px;">
            <button class="btn btn-ghost btn-sm" data-remove-budget="${b.id}">Remove</button>
          </div>
        </div>`;
      })
      .join("");

    list.querySelectorAll("[data-remove-budget]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Remove this budget?")) return;
        await Api.deleteBudget(Number(btn.dataset.removeBudget));
        toast("Budget removed", "success");
        loadBudgetsView();
      })
    );
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("open-add-budget").addEventListener("click", async () => {
  await loadCategories();
  document.getElementById("budget-error").textContent = "";
  document.getElementById("budget-form").reset();
  openModal("budget-modal-overlay");
});

document.getElementById("budget-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("budget-error");
  errorEl.textContent = "";
  const payload = {
    category_id: Number(document.getElementById("budget-category").value),
    limit_amount: parseFloat(document.getElementById("budget-amount").value),
  };
  try {
    await Api.upsertBudget(payload);
    toast("Budget saved", "success");
    closeModal("budget-modal-overlay");
    loadBudgetsView();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------
function loadSettingsView() {
  const u = state.user;
  document.getElementById("settings-name").value = u.full_name || "";
  document.getElementById("settings-email").value = u.email;
  document.getElementById("settings-currency").value = u.currency;
  document.getElementById("settings-budget").value = u.monthly_budget || "";

  const passwordSection = document.getElementById("password-form");
  const passwordHint = document.getElementById("password-hint");
  // Google-only accounts won't have a usable password flow server-side beyond setting one;
  // we still allow it since backend treats missing hashed_password gracefully.
}

document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById("settings-name").value.trim(),
    currency: document.getElementById("settings-currency").value,
    monthly_budget: parseFloat(document.getElementById("settings-budget").value) || 0,
  };
  try {
    const updated = await Api.updateMe(payload);
    state.user = updated;
    Auth.setUser(updated);
    renderUserChip();
    toast("Profile updated", "success");
  } catch (err) {
    toast(err.message, "error");
  }
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("password-error");
  errorEl.textContent = "";
  const current_password = document.getElementById("current-password").value;
  const new_password = document.getElementById("new-password").value;
  if (new_password.length < 6) {
    errorEl.textContent = "New password must be at least 6 characters.";
    return;
  }
  try {
    await Api.changePassword({ current_password, new_password });
    toast("Password updated", "success");
    document.getElementById("password-form").reset();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
async function init() {
  try {
    state.user = await Api.me();
    Auth.setUser(state.user);
  } catch (err) {
    toast("Could not load your profile.", "error");
    return;
  }
  renderUserChip();
  await loadCategories();
  showView("dashboard");
}

init();
