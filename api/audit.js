// POST /api/audit { repo: "owner/name" }  ->  deterministic checklist + Gemma 4 action plan & CONTRIBUTING.md draft
const { gemmaJSON, readBody } = require("./_gemma");
const { collect } = require("../lib/audit");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const facts = await collect(readBody(req).repo);
    const { readmeExcerpt, ...pub } = facts;
    const missing = facts.checks.filter((c) => !c.ok).map((c) => c.label);
    const prompt = `You are RepoReady, an open-source maintainer coach. Help the maintainers of ${facts.repo.full} get more first-time contributors (Hacktoberfest and beyond).
Repo facts: ${JSON.stringify(pub.repo)}
Readiness score ${facts.score}/100. Missing: ${missing.join("; ") || "nothing"}.
README (first part):
"""${readmeExcerpt || "(no README)"}"""
Be specific to THIS repo (its language, purpose and README). Return ONLY JSON:
{"summary":"2 sentences on how welcoming the repo is to newcomers",
"strengths":["max 3"],
"fixes":[{"title":"short action","why":"impact on contributors","how":"exact steps or file path","effort":"5 min|30 min|1 hour"}],
"starterIssues":[{"title":"a real beginner task maintainers could open for this repo","body":"2-3 sentence issue body with acceptance criteria","labels":["good first issue","documentation"]}],
"contributing":"a complete CONTRIBUTING.md in Markdown tailored to this repo's stack: setup, branch naming, commit style, how to run tests, PR checklist (30-50 lines, concise)"}
fixes: max 5, most impactful first, only for missing or weak items. starterIssues: exactly 3.`;
    let ai = null, aiError = null;
    try { ai = (await gemmaJSON(prompt, { maxOutputTokens: 2600 })); } catch (e) { aiError = e.message; }
    res.status(200).json({ ...pub, ai: ai?.data || null, model: ai?.model || null, aiError });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Something went wrong" });
  }
};
