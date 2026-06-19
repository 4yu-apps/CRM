// Content script classico que carrega o modulo ESM (main.mjs).
// MV3 nao permite content_scripts type=module; o padrao e importar via
// chrome.runtime.getURL a partir de web_accessible_resources.
(async () => {
  try {
    const url = chrome.runtime.getURL("src/content/main.mjs");
    await import(url);
  } catch (e) {
    console.error("[garimpo] falha ao carregar main.mjs:", e);
  }
})();
