// Collects public repo facts from the GitHub REST API and scores contributor-readiness (no AI here).
const GH = "https://api.github.com";
const DAY = 864e5;

function parseRepo(input) {
  const m = /(?:github\.com\/)?([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+?)(?:\.git)?(?:[\/#?].*)?$/.exec(String(input || "").trim());
  if (!m) throw Object.assign(new Error("Enter a repo as owner/name or a github.com URL"), { status: 400 });
  return { owner: m[1], repo: m[2] };
}

async function gh(path, accept = "application/vnd.github+json") {
  const headers = { Accept: accept, "User-Agent": "RepoReady", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(GH + path, { headers, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return null;
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error("GitHub API rate limit reached. Add GITHUB_TOKEN or try again later."), { status: 429 });
  if (!r.ok) throw Object.assign(new Error(`GitHub error ${r.status}`), { status: 502 });
  return accept.includes("raw") ? r.text() : r.json();
}

async function collect(input) {
  const { owner, repo } = parseRepo(input);
  const meta = await gh(`/repos/${owner}/${repo}`);
  if (!meta) throw Object.assign(new Error(`Repo ${owner}/${repo} not found (or private)`), { status: 404 });
  const full = meta.full_name;
  const [community, readme, labels, gfi] = await Promise.all([
    gh(`/repos/${full}/community/profile`).catch(() => null),
    gh(`/repos/${full}/readme`, "application/vnd.github.raw+json").catch(() => null),
    gh(`/repos/${full}/labels?per_page=100`).catch(() => []),
    gh(`/repos/${full}/issues?state=open&labels=${encodeURIComponent("good first issue")}&per_page=5`).catch(() => []),
  ]);
  const files = community?.files || {};
  const labelNames = (labels || []).map((l) => l.name.toLowerCase());
  const has = (re) => labelNames.some((n) => re.test(n));
  const pushedDays = Math.round((Date.now() - new Date(meta.pushed_at).getTime()) / DAY);
  const topics = meta.topics || [];
  const readmeText = String(readme || "");

  const checks = [
    { id: "description", label: "Repo has a description", ok: !!meta.description, weight: 5 },
    { id: "readme", label: "README exists", ok: !!readme, weight: 15 },
    { id: "readme_setup", label: "README explains install / setup", ok: /install|setup|getting started|quick ?start|usage|run locally|git clone|npm (i|install|run)|pip install|docker/i.test(readmeText), weight: 8 },
    { id: "license", label: "Open-source LICENSE", ok: !!(meta.license || files.license), weight: 15, detail: meta.license?.spdx_id },
    { id: "contributing", label: "CONTRIBUTING guide", ok: !!files.contributing, weight: 12 },
    { id: "coc", label: "Code of Conduct", ok: !!files.code_of_conduct || !!files.code_of_conduct_file, weight: 8 },
    { id: "issue_tpl", label: "Issue templates", ok: !!files.issue_template, weight: 6 },
    { id: "pr_tpl", label: "Pull request template", ok: !!files.pull_request_template, weight: 6 },
    { id: "gfi_label", label: '"good first issue" label exists', ok: has(/good.?first.?issue|beginner|easy/), weight: 8 },
    { id: "gfi_open", label: "Open good-first issues to pick", ok: (gfi || []).length > 0, weight: 7, detail: `${(gfi || []).length}${(gfi || []).length === 5 ? "+" : ""} open` },
    { id: "hacktoberfest", label: '"hacktoberfest" topic (or label)', ok: topics.includes("hacktoberfest") || has(/hacktoberfest/), weight: 5 },
    { id: "active", label: "Active in the last 90 days", ok: pushedDays <= 90, weight: 5, detail: `last push ${pushedDays} days ago` },
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / total) * 100);
  return {
    repo: { full, url: meta.html_url, description: meta.description, stars: meta.stargazers_count, forks: meta.forks_count, openIssues: meta.open_issues_count, language: meta.language, topics, license: meta.license?.spdx_id || null, defaultBranch: meta.default_branch, archived: meta.archived },
    checks, score, grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F",
    goodFirstIssues: (gfi || []).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, url: i.html_url })),
    readmeExcerpt: readmeText.slice(0, 2500),
  };
}
module.exports = { collect, parseRepo };
