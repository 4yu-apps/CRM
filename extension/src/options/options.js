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
  const s = document.getElementById("status");
  s.textContent = "salvo ✓";
  setTimeout(() => (s.textContent = ""), 1500);
});

load();
