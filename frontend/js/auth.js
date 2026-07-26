Auth.redirectIfLoggedIn();

function initGoogleButton(onCredential) {
  const container = document.getElementById("google-btn-container");
  if (!container) return;

  if (!window.LEDGER_GOOGLE_CLIENT_ID) {
    container.innerHTML =
      '<p style="font-size:12.5px;color:var(--slate);text-align:center;line-height:1.5;">Google sign-in isn\'t configured yet.<br>Add your client ID in <code>frontend/js/config.js</code>.</p>';
    return;
  }

  function render() {
    if (!window.google || !window.google.accounts) {
      setTimeout(render, 150);
      return;
    }
    google.accounts.id.initialize({
      client_id: window.LEDGER_GOOGLE_CLIENT_ID,
      callback: (response) => onCredential(response.credential),
    });
    google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      width: 340,
      text: "continue_with",
      shape: "pill",
    });
  }
  render();
}

async function handleCredential(credential, btn) {
  try {
    const data = await Api.googleLogin(credential);
    Auth.setSession(data.access_token, data.user);
    window.location.href = "index.html";
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---------- Login page ----------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("expired")) {
    toast("Your session expired. Please sign in again.", "info");
  }

  initGoogleButton(handleCredential);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const btn = document.getElementById("login-submit");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const data = await Api.login({ email, password });
      Auth.setSession(data.access_token, data.user);
      window.location.href = "index.html";
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });
}

// ---------- Signup page ----------
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  initGoogleButton(handleCredential);

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("signup-error");
    errorEl.textContent = "";
    const btn = document.getElementById("signup-submit");

    const full_name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (password.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = "Passwords don't match.";
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const data = await Api.signup({ full_name, email, password });
      Auth.setSession(data.access_token, data.user);
      window.location.href = "index.html";
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Create account";
    }
  });
}
