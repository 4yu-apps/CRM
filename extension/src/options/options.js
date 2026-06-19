const FIELDS = ["dataSource", "supabaseUrl", "anonKey", "accessToken"];

async function load() {
  const stored = await chrome.storage.local.get(FIELDS);
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el && stored[f] != null) el.value = stored[f];
  }
}

document.getElementById("save").addEventListener("click", async () => {
  const patch = {};
  for (const f of FIELDS) patch[f] = document.getElementById(f).value.trim();
  await chrome.storage.local.set(patch);
  flash("status", "salvo ✓");
});

// Login direto na auth REST do Supabase: troca email/senha por access_token.
document.getElementById("login").addEventListener("click", async () => {
  const url = document.getElementById("supabaseUrl").value.trim().replace(/\/$/, "");
  const anon = document.getElementById("anonKey").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!url || !anon) return flash("loginStatus", "preencha URL + anon key", true);

  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || `HTTP ${r.status}`);
    document.getElementById("accessToken").value = data.access_token;
    await chrome.storage.local.set({ accessToken: data.access_token, dataSource: "supabase" });
    document.getElementById("dataSource").value = "supabase";
    flash("loginStatus", "logado ✓ (token salvo)");
  } catch (e) {
    flash("loginStatus", "falhou: " + e.message, true);
  }
});

function flash(id, msg, error) {
  const s = document.getElementById(id);
  s.textContent = msg;
  s.style.color = error ? "#b91c1c" : "#047857";
  if (!error) setTimeout(() => (s.textContent = ""), 2000);
}

load();
