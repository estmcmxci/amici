# amici.eth pipeline — build instruction

Instruction for the agent building the automated ENSIP preview pipeline. Under 1000 chars by design, meant to be handed off as-is.

---

Build a GitHub Action in a new repo (estmcmxci/amici) giving ENS Improvement Proposal drafts Vercel-style preview deploys.

Reference implementation: this project (~/Desktop/amici, formerly ensip-27-docs — a Vocs site rendering ENSIP-27). Reuse its vocs.config.ts, EnsipHeader.tsx, _root.css (ENS/Thorin tokens), and its frontmatter->EnsipHeader->body markdown transform.

Pipeline (scheduled poll of ensdomains/ensips - no native cross-repo PR events; trigger per commit, not per PR-open):
1. Detect new/changed ensips/{n}.md via gh pr list / gh api.
2. Fetch raw markdown, apply the transform, write into a templated Vocs project, run vocs build.
3. Pin dist/ to Pinata, get CID.
4. Set {n}.amici.eth contenthash on-chain to that CID.
5. Comment the live gateway link back on the PR.

Signer: read only from GitHub secret AMICI_SIGNER_KEY, never written to any file/log/comment. This wallet is amici.eth's approved operator, not owner - amici.eth stays owned by estmcmxci.eth. Skip if content unchanged since last run (idempotent).

---

See also: `reference/` in this project (shallow clones of ensdomains/docs, ensdomains/thorin, ensdomains/ensips, wevm/vocs — the actual sources this pipeline's config and transform logic were reverse-engineered from) and the `ens-vocs-docs` skill (`~/.claude/skills/ens-vocs-docs/`) for the full build workflow and gotchas encountered getting this working.
