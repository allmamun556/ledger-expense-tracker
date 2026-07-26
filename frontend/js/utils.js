function ensureToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function toast(message, type = "info", duration = 3800) {
  const stack = ensureToastStack();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, duration);
}

function currencySymbol(code) {
  const map = { EUR: "€", USD: "$", GBP: "£", BDT: "৳", INR: "₹", JPY: "¥" };
  return map[code] || code + " ";
}

function formatMoney(amount, currency = "EUR") {
  const sym = currencySymbol(currency);
  const num = Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${num}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso(offsetMonths = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toISOString().slice(0, 10);
}

function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function initialsFrom(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
