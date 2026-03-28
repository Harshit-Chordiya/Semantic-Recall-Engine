(async function main() {
  const css = `
    mark.webmemory-hit {
      background: #fffb91;
      padding: 0 .15em;
      border-radius: 3px;
      box-shadow: 0 0 0 2px rgba(255,235,59,.35);
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.documentElement.appendChild(style);

  // Always ping visit first
  try { chrome.runtime.sendMessage({ type: "VISIT", url: location.href }); } catch (e) {}

  // Try pending highlight from storage.session (older path still supported)
  try {
    const key = `highlight::${location.href}`;
    const data = await chrome.storage.session.get(key);
    const snippet = data[key];
    if (snippet) {
      highlight({ snippet, query: "" });
      await chrome.storage.session.remove(key);
    }
  } catch (e) {}

  // Auto-index (unchanged safety; VISIT was already sent above)
  setTimeout(async () => {
    try {
      const { autoIndex, denylist } = await chrome.storage.sync.get(["autoIndex", "denylist"]);
      const host = location.hostname;
      if (!autoIndex) return;
      if (Array.isArray(denylist) && denylist.some(d => host.endsWith(d))) return;

      const text = document.body?.innerText || "";
      const title = document.title || location.href;
      if (text && text.trim().length >= 50) {
        chrome.runtime.sendMessage({ type: "INDEX_PAGE", url: location.href, title, text });
      }
    } catch (e) {}
  }, 3500); // 3.5 second delay allows dynamic content (like news liveblogs) to fully load
})();

// Listen for background-triggered highlight after the tab loads
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "HIGHLIGHT") highlight({ snippet: msg.snippet, query: msg.query });
});

// ---- Highlight helpers ----
function highlight({ snippet, query }) {
  let found = false;

  if (snippet && snippet.trim()) {
    const cleanSnippet = snippet.replace(/\s+/g, " ").trim();
    
    // 1) Try standard window.find with the full cleaned text
    // The browser automatically highlights AND scrolls into view if it succeeds.
    found = window.find(cleanSnippet, false, false, true, false, false, false);
    
    // 2) If full block fails (e.g. truncated boundaries), search robust sentences
    if (!found) {
      const sentences = cleanSnippet.split(/(?<=[.?!])\s+/).filter(s => s.length > 20);
      for (const s of sentences) {
        if (window.find(s.trim(), false, false, true, false, false, false)) {
          found = true;
          break;
        }
      }
    }
    
    // 3) Try overlapping 6-word phrases as an ultimate fallback
    if (!found) {
      const words = cleanSnippet.split(" ");
      for (let i = 0; i < words.length - 6; i += 4) {
        const phrase = words.slice(i, i + 6).join(" ");
        if (window.find(phrase, false, false, true, false, false, false)) {
          found = true;
          break;
        }
      }
    }
  }

  // 4) If all snippet searches failed, natively jump to the exact user query
  if (!found && query && query.trim()) {
    found = window.find(query.trim(), false, false, true, false, false, false);
  }

  // 5) ULTIMATE KEYWORD ANCHOR: If the query is in human language (not an exact sentence), 
  // isolate the most distinct, rarest words (by length) and track them down natively.
  // This bypasses all HTML fragmentation and lands the user immediately on the relevant subject.
  if (!found && query && query.trim()) {
    const keywords = query.trim().split(/\s+/).filter(w => w.length >= 4);
    // Sort longest words first (e.g., 'constituent' before 'top')
    keywords.sort((a, b) => b.length - a.length);
    
    for (const keyword of keywords) {
      if (window.find(keyword, false, false, true, false, false, false)) {
        found = true;
        break; // Successfully jumped to the most contextually relevant rare keyword!
      }
    }
  }
}