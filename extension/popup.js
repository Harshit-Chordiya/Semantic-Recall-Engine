const q = document.getElementById("q");
const resultsEl = document.getElementById("results");
const aiAnswerEl = document.getElementById("ai-answer");

const openBtn = document.getElementById("openOptions");
if (openBtn && chrome?.runtime?.openOptionsPage) {
    openBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

const go = document.getElementById("go");
if (go) {
    go.addEventListener("click", doSearch);
}
q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        doSearch();
    }
});

function renderResult(r, index) {
    const el = document.createElement("div");
    el.className = "result";
    el.style.animationDelay = `${index * 0.05}s`;
    el.innerHTML = `
    <div class="title">${escapeHtml(r.title || r.url)}</div>
    <div class="snippet">${escapeHtml(r.snippet)}</div>
  `;
    el.addEventListener("click", async () => {
        try {
            const query = q.value.trim();
            chrome.runtime.sendMessage({
                type: "OPEN_AND_HIGHLIGHT",
                url: r.url,
                snippet: r.snippet,
                query
            });
            window.close();
        } catch (e) {
            console.error("OPEN_AND_HIGHLIGHT failed:", e);
        }
    });
    resultsEl.appendChild(el);
}

async function doSearch() {
    const query = (q.value || "").trim();
    if (!query) {
        resultsEl.innerHTML = `<div class="status-msg empty">Type above to search your visited pages.</div>`;
        return;
    }

    resultsEl.innerHTML = `<div class="status-msg">Searching memory...</div>`;
    aiAnswerEl.classList.add("hidden");

    try {
        const resp = await chrome.runtime.sendMessage({ type: "SEARCH", query, topK: 100 });
        if (!resp?.ok) {
            resultsEl.innerHTML = `<div class="status-msg error">Server error. Is the backend running?</div>`;
            return;
        }
        const results = Array.isArray(resp.results) ? resp.results : [];

        if (resp.answer) {
            aiAnswerEl.innerHTML = `<strong>🤖 AI Summary</strong> ${escapeHtml(resp.answer).replace(/\n/g, "<br>")}`;
            aiAnswerEl.classList.remove("hidden");
        }

        if (results.length === 0) {
            resultsEl.innerHTML = `<div class="status-msg empty">No memories found for "${escapeHtml(query)}".</div>`;
            return;
        }

        resultsEl.innerHTML = "";
        // Deduplicate results by URL so we don't spam the UI with 5+ links to the exact same liveblog
        const uniqueResults = [];
        const seenUrls = new Set();
        for (const r of results) {
            if (!seenUrls.has(r.url)) {
                uniqueResults.push(r);
                seenUrls.add(r.url);
            }
        }

        uniqueResults.slice(0, 5).forEach((r, idx) => renderResult(r, idx));
    } catch (e) {
        console.error("SEARCH failed:", e);
        resultsEl.innerHTML = `<div class="status-msg error">Connection failed. Is the API running?</div>`;
    }
}

function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Auto-focus search box when opened
setTimeout(() => q.focus(), 100);
