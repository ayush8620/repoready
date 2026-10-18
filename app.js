const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let contributing = "";
document.querySelectorAll("[data-r]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); $("#repo").value = a.dataset.r; $("#f").requestSubmit(); }));

function ring(score) {
  const c = score >= 70 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--bad)";
  return `<div style="width:120px;height:120px;border-radius:50%;background:conic-gradient(${c} ${score * 3.6}deg,#232a36 0);display:grid;place-items:center;flex:none">
    <div style="width:96px;height:96px;border-radius:50%;background:var(--card);display:grid;place-items:center;text-align:center"><div><div style="font-size:30px;font-weight:900">${score}</div><div class="muted small">/ 100</div></div></div></div>`;
}

function render(d) {
  const r = d.repo, ai = d.ai || {};
  contributing = ai.contributing || "";
  const checks = d.checks.map((c) => `<li class="row" style="justify-content:space-between"><span>${c.ok ? "✅" : "❌"} ${esc(c.label)}</span><span class="muted small">${esc(c.detail || "")}</span></li>`).join("");
  const fixes = (ai.fixes || []).map((f, i) => `<li><b>${i + 1}. ${esc(f.title)}</b> <span class="badge warn">${esc(f.effort)}</span><div class="muted small">${esc(f.why)}</div><div class="small" style="margin-top:4px">${esc(f.how)}</div></li>`).join("");
  const issues = (ai.starterIssues || []).map((s) => {
    const url = `${r.url}/issues/new?title=${encodeURIComponent(s.title)}&body=${encodeURIComponent(s.body)}&labels=${encodeURIComponent((s.labels || []).join(","))}`;
    return `<li><b>${esc(s.title)}</b><div class="muted small">${esc(s.body)}</div><div class="row small" style="margin-top:6px">${(s.labels || []).map((l) => `<span class="badge ok">${esc(l)}</span>`).join("")}<a href="${esc(url)}" target="_blank" rel="noopener">Open as issue ↗</a></div></li>`;
  }).join("");
  const gfi = d.goodFirstIssues.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">#${i.number} ${esc(i.title)}</a></li>`).join("");
  $("#out").innerHTML = `
  <div class="grid">
    <div class="card">
      <div class="row" style="gap:16px;flex-wrap:nowrap">${ring(d.score)}
        <div><div class="muted small">Contributor-readiness · grade <b>${esc(d.grade)}</b></div>
        <a href="${esc(r.url)}" target="_blank" rel="noopener" style="font-size:19px;font-weight:800">${esc(r.full)}</a>
        <div class="muted small">${esc(r.description || "No description")}</div>
        <div class="small" style="margin-top:6px">⭐ ${r.stars} · 🍴 ${r.forks} · ${esc(r.language || "")} · ${esc(r.license || "no license")}</div></div></div>
      <div class="sec"><h3>12 readiness checks</h3><ul class="list">${checks}</ul></div>
      ${gfi ? `<div class="sec"><h3>Open good first issues</h3><ul>${gfi}</ul></div>` : ""}
    </div>
    <div class="card">
      ${d.ai ? `<h2>Gemma 4 action plan</h2><p>${esc(ai.summary)}</p>
        ${(ai.strengths || []).length ? `<div class="chips">${ai.strengths.map((s) => `<span class="badge ok">✓ ${esc(s)}</span>`).join("")}</div>` : ""}
        ${fixes ? `<div class="sec"><h3>Fix these first</h3><ul class="list">${fixes}</ul></div>` : ""}
        ${issues ? `<div class="sec"><h3>Starter issues to open</h3><ul class="list">${issues}</ul></div>` : ""}
        ${contributing ? `<div class="sec"><div class="row" style="justify-content:space-between"><h3>Tailored CONTRIBUTING.md</h3><div class="row"><button class="ghost" id="copy" type="button" style="padding:6px 10px;font-size:12px">Copy</button><button class="ghost" id="dl" type="button" style="padding:6px 10px;font-size:12px">Download</button></div></div><pre style="max-height:320px">${esc(contributing)}</pre></div>` : ""}
        <p class="muted small">Model: ${esc(d.model)}</p>`
      : `<div class="err">The checklist worked, but the AI plan failed: ${esc(d.aiError)}</div>`}
    </div>
  </div>`;
  $("#copy") && ($("#copy").onclick = async (e) => { await navigator.clipboard.writeText(contributing); e.target.textContent = "Copied ✓"; });
  $("#dl") && ($("#dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([contributing], { type: "text/markdown" })); a.download = "CONTRIBUTING.md"; a.click(); });
}

$("#f").onsubmit = async (e) => {
  e.preventDefault();
  $("#error").innerHTML = "";
  const repo = $("#repo").value.trim();
  if (!repo) { $("#error").innerHTML = `<div class="err">Enter a repo like owner/name.</div>`; return; }
  const btn = $("#go"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Checking…`;
  $("#out").innerHTML = `<div class="card empty">Reading GitHub and asking Gemma 4 for a plan…</div>`;
  try {
    const r = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo }) });
    const d = await r.json().catch(() => ({ error: "Server returned an invalid response" }));
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
    history.replaceState(null, "", `?repo=${encodeURIComponent(d.repo.full)}`);
    render(d);
  } catch (err) { $("#out").innerHTML = ""; $("#error").innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  finally { btn.disabled = false; btn.textContent = "Check repo"; }
};
const q = new URLSearchParams(location.search).get("repo");
if (q) { $("#repo").value = q; $("#f").requestSubmit(); }
