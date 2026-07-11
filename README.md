# amici

## Status: paused (2026-07-10)

Deprioritized after the on-chain setup was complete but before the pipeline ran end-to-end. Building a bespoke ENSIP preview site turned out to be low-leverage relative to the actual need — a single static HTML explainer, shared directly, did the job. Wrapping up here rather than continuing to harden the automation.

**What's real and not wasted** — all verified live on-chain, not just configured:
- Safe `0xa824273494c7371C2601F76C52219dE9Ac7CE90D` (1-of-1, owner `0x703ae03fB120eC91e9Ed6d08Ce8044E498CC789B`) exists and is the recognized operator on `amici.eth` ([tx](https://etherscan.io/tx/0x1de2b33c7111bae4b2ed360e42842f920337a796404dfa3917635c48cc81385e))
- Zodiac Roles Modifier `0xc6f36abA15b3A7C898dA0Eb1936696E79027b71a` is deployed and enabled as a Safe module
- Role `ENS_DEPLOYER` (`0xc86400a1...`) is assigned to signer `0x83Dc91c1CDd54D194D7Bf7F286030557Dcf2eBcc` and scoped to exactly two things: `setContenthash` on amici.eth's PublicResolver ([tx](https://etherscan.io/tx/0xb8f2d5416bbde1bf96952977a8b0ddc8163a6d30e9bc3ec3087ade3410660ba5)), and `setSubnodeRecord` on the ENS Registry ([tx](https://etherscan.io/tx/0xbe94b69d2359807ead021a21747c7db5beb20a2fe8a3ac9ab1c005e7064a3292)) — nothing else, verified via decoded event logs both times, not just tx success
- `estmcmxci/amici` is public on GitHub with secrets/vars provisioned

This is genuinely reusable infrastructure if this gets picked back up — the hard part (least-privilege Safe + Zodiac setup, verified against actual contract source rather than assumed) is done.

**What's not done:**
- **The GitHub Actions run failed** (`workflow_dispatch` run [29132569564](https://github.com/estmcmxci/amici/actions/runs/29132569564)): `omnipin/` was committed as a bare git submodule reference (mode `160000`) with no `.gitmodules` file, so `actions/checkout@v4` never fetches its actual contents — `omnipin/src/*` doesn't exist on the runner, so `scripts/lib/subname.ts`'s import of it fails immediately (`ERR_MODULE_NOT_FOUND`). Needs either a proper `git submodule add` (with `.gitmodules` and `submodules: true` on checkout) or vendoring omnipin's source directly instead of as a nested repo.
- **No ENSIP subname was ever created on amici.eth.** `27.amici.eth` doesn't exist in the Registry — the Zodiac permissions above are live and correct but were never exercised end-to-end.
- **Vocs' build output turned out to be SSR-only** (`dist/server/` + `dist/public/`, zero static `.html` files) — not directly IPFS-pinnable as originally assumed. Vocs supports a `renderStrategy: 'full-static'` config option that would fix this, untested. Punted in favor of just using the already-existing standalone HTML explainer instead.
- **What actually shipped**: `~/Desktop/ensip-27-explainer.html` (a pre-existing, self-contained static page, unrelated to this pipeline) pinned to Pinata — CID `bafkreidlpcvbsrurze37lccukhugwt5q73rr5hzkt34cksghu56lwqmifq` — and shared directly in the Telegram channel. Not wired to any ENS name.

---

Automated Vercel-style preview deploys for ENS Improvement Proposal drafts. A scheduled GitHub Action polls open PRs on [`ensdomains/ensips`](https://github.com/ensdomains/ensips), rebuilds a `docs.ens.domains`-styled site for any changed `ensips/{n}.md`, pins it to IPFS, and points `{n}.amici.eth`'s contenthash at the new CID — then announces the live link via a step summary and [`PREVIEWS.md`](./PREVIEWS.md), and additionally as a PR comment if `AMICI_ENSIPS_TOKEN` is configured (see below — not available as of this writing).

Full design: [`AMICI_PIPELINE.md`](./AMICI_PIPELINE.md). Build workflow/gotchas for the Vocs+Thorin site itself: `~/.claude/skills/ens-vocs-docs/SKILL.md`.

## Layout

```
amici/
├── template/           Reusable Vocs project. scripts/build-ensip.ts overwrites
│                       vocs.config.ts + src/pages/index.mdx + src/pages/ensip/{n}.mdx
│                       here on every build, then runs `vocs build`.
├── scripts/
│   ├── lib/
│   │   ├── ensip-transform.ts   Fetch + transform one ensips/{n}.md at a git ref
│   │   ├── ens-contracts.ts     Verified ENS Registry address + setSubnodeRecord selector
│   │   ├── subname.ts           Create {n}.amici.eth in the Registry, first time only
│   │   ├── previews.ts          Regenerate PREVIEWS.md from state
│   │   └── state.ts             Read/write .amici-state.json
│   ├── build-ensip.ts   Transform + write + `vocs build` for one ENSIP number
│   └── poll-ensips.ts   Entry point: find changed PRs, create subname if needed, build, pin+update ENS, announce
├── omnipin/            Forked CLI (estmcmxci/omnipin) that pins to IPFS and
│                       writes the ENS contenthash. Built with bun, invoked as
│                       a plain child process — not a submodule (see Gaps below).
├── reference/          Shallow clones of ensdomains/docs, thorin, ensips, wevm/vocs —
│                       what the template's config/tokens were reverse-engineered from.
├── .amici-state.json   Idempotency state (PR:ENSIP -> last-processed SHA), committed
│                       back by the workflow after every run that deploys something.
└── .github/workflows/amici-pipeline.yml
```

The original hardcoded ENSIP-27-only site is still checked in at the repo root
(`vocs.config.ts`, `src/`, `public/` next to this README) from before the pipeline
existed — `template/` supersedes it functionally (it can reproduce the identical
output for ENSIP-27 specifically), but it hasn't been deleted since nothing asked
for that cleanup yet.

## Required secrets

| Secret | Purpose |
|---|---|
| `AMICI_SIGNER_KEY` | Private key of the Zodiac Roles member that's allowed to update ENS contenthash records. **Not** amici.eth's owner key — mapped to omnipin's `OMNIPIN_PK` env var at invocation time, never written to a file/log/comment. |
| `AMICI_ENSIPS_TOKEN` | **Optional.** A token with comment permission on `ensdomains/ensips` (an external repo amici doesn't own) — not available as of this writing, see below. Reading that repo's PR list doesn't need this; it uses the default `GITHUB_TOKEN`. Leave unset and the pipeline still builds/pins/updates ENS; it just skips the PR comment and relies on the step summary + `PREVIEWS.md` instead. |
| `OMNIPIN_PINATA_TOKEN` | Pinata JWT, one of possibly several IPFS pinning providers. Add more `OMNIPIN_*_TOKEN` secrets and reference them in the workflow's `env:` block as needed — see `omnipin/skills/omnipin-deploy/SKILL.md` for the full provider list. |

## Required repo variables

| Variable | Purpose |
|---|---|
| `AMICI_SAFE` | Address (or ENS name) of the Safe that manages `amici.eth`. |
| `AMICI_ROLES_MOD_ADDRESS` | Address of the Zodiac Roles Modifier attached to that Safe. |

## Manual prerequisites (not scriptable)

1. **Create a Safe** at [app.safe.global](https://app.safe.global) if one doesn't exist yet, and transfer `amici.eth`'s Registry-level ownership to it — currently `0xFE8B7DfE5AB87Ce0378abFa6c13d96242FA8D364` (a plain EOA, verified live, not a Safe yet).
2. **Install the Zodiac Roles Module** on that Safe via the [Zodiac app](https://app.safe.global/share/safe-app?appUrl=https%3A%2F%2Fzodiac.gnosisguild.org%2F).
3. **Generate the role setup** with the vendored fork: `omnipin zodiac --safe <safe-address>` produces `zodiac.json`; upload it via the Safe Transaction Builder to create the `ENS_DEPLOYER` role scoped to `setContenthash` only. This is what makes the CI signer "an approved operator, not an owner" per `AMICI_PIPELINE.md`.
4. **`{n}.amici.eth` subname creation is now implemented** (`scripts/lib/subname.ts`, called from `poll-ensips.ts` before every deploy) — decided: standard `PublicResolver`, so this targets the **base ENS Registry's own `setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)`**, not NameWrapper's same-named-but-different function. This was confirmed against amici.eth's actual live on-chain state, not assumed:
   - **Live-checked (enswhois + a direct `eth_call`, cross-verified against `vitalik.eth` as a control): `amici.eth` is registered, unwrapped (`is_wrapped: false`), and already resolves through the standard PublicResolver** (`0xF29100983E058B709F3D539b0c765937B804AC15` on mainnet) — so no wrapping step is needed, but it does mean NameWrapper's `setSubnodeRecord` (7 args, string label, fuses/expiry) would have been the wrong call entirely; the Registry's version (5 args, bytes32 `labelhash`) is correct for this name's actual state.
   - **The ENS Registry's own `owner(namehash("amici.eth"))` is currently `0xFE8B7DfE5AB87Ce0378abFa6c13d96242FA8D364`** (a plain EOA — confirmed via `eth_getCode` returning `0x`, i.e. no bytecode) — this is the address that needs to become the Safe for the pipeline to work; it isn't yet. (Note: an ENS indexer's "owner" field for this name reported a *different* address during this check — that other address turned out to be an EIP-7702-delegated EOA, not the Registry's actual node owner. The Registry's own `owner(node)` via direct `eth_call` is the authoritative value for anything authorization-related here, which is why prerequisite 1 below is scoped to that specific address.)
   - Reasoning for why creation is required at all (standard `PublicResolver`'s `setContenthash` is gated by `isAuthorised(node)` → `ens.owner(node)`, which is the zero address for a subname that's never been created, reverting for *everyone* including the parent owner) verified directly against `ensdomains/ens-contracts`'s `PublicResolver.sol` + `ResolverBase.sol`. omnipin itself never does this (confirmed — zero mentions of subdomain/subname/wildcard/NameWrapper anywhere in the fork, including its own `omnipin-deploy` skill).
   - New subnames are created with `owner = the Safe` (never the CI signer) and `resolver` = whatever `amici.eth` itself currently resolves through — so a compromised `AMICI_SIGNER_KEY` can create junk subnames at worst, never hand one to an attacker, and the Safe (parent owner) can always reassign/reclaim since no fuses are burned.
5. **Extend the existing `ENS_DEPLOYER` Zodiac role** (not a new role — `execTransactionWithRole` hardcodes the same role key for every call) with a second scoped permission: target = the ENS Registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`), selector = `0x5ef2c7f0` (`setSubnodeRecord(bytes32,bytes32,address,address,uint64)`, verified with `cast sig`). Unlike the resolver scope (which `omnipin zodiac` generates for you), this one isn't auto-generated — hand-rolling the exact Zodiac Roles v2 Condition encoding for "owner/resolver must equal X" carries real risk of a subtly-wrong permission if gotten wrong, which fails in the *unsafe* direction. Configure it as a properly parameter-conditioned `scopeFunction` (owner fixed to the Safe's address, resolver fixed, label free) via the Zodiac Roles app's own Conditions Builder UI rather than a plain unconditional `allowFunction` — that UI is designed for exactly this and is safer than a hand-built JSON here.

## Local testing

Build one ENSIP by hand without touching the scheduler:

```sh
npx tsx scripts/build-ensip.ts \
  --number 27 \
  --ref 47ff1fde854ea84376eaadf4c78fb43cc662134b \
  --pr-number 64 \
  --pr-url https://github.com/ensdomains/ensips/pull/64
```

Then `cd template && npm run preview` and open `http://localhost:4173/ensip/27`.

The full `npm run poll` requires `AMICI_SIGNER_KEY`, `AMICI_SAFE`, `AMICI_ROLES_MOD_ADDRESS`, and a built `omnipin/dist/index.js` (`cd omnipin && bun install && bun run build`) — none of which exist yet in this scaffolding pass, so it hasn't been run end-to-end.

## Verified so far

- `scripts/build-ensip.ts` was run against the real, currently-open ENSIP-27 draft PR (`ensdomains/ensips#64`) and produces a correct build — confirmed by loading the output in a browser via Playwright (title, headings, tables, `EnsipHeader` metadata, ENS/Thorin styling all render; 0 console errors).
- The vendored `omnipin` fork installs and builds cleanly with `bun` and its CLI runs (`--help`, subcommand list).
- `amici.eth`'s actual on-chain state (unwrapped, standard PublicResolver, current Registry owner) was checked live rather than assumed — see prerequisite 4 above. The registry-read path in `scripts/lib/subname.ts` was smoke-tested directly against mainnet: `amici.eth` and `vitalik.eth` (as a control — returned Vitalik's well-known address, confirming the namehash/decode logic is correct) resolve to real owners, `27.amici.eth` correctly reads back as the zero address (not yet created). This caught a real bug in the process: `ox`'s `decodeResult` returns the bare value directly for single-output ABI functions rather than an array — `const [owner] = decodeResult(...)` was silently destructuring the first *character* of the address string instead of the address itself. Fixed.
- The Safe, Zodiac Roles Modifier, and both scoped permissions (prerequisites 1, 2, 3, 5 below) were all completed and verified live on-chain — see the Status section at top for tx hashes and decoded event confirmation.
- **Never run end-to-end**: the actual pin + ENS contenthash update and the new subname-creation transaction (`omnipin deploy --safe --roles-mod-address` and `ensureSubnameExists`'s write path). The one real attempt (via GitHub Actions) failed on a CI-environment bug before reaching that code — see Status section. `npm audit` also flagged 2 high-severity advisories in omnipin's own dependency tree (upstream's deps, not something introduced by the fork) — worth a look before relying on this for anything real.

## Known gaps

- **No teardown.** If a PR is merged or closed, its `{n}.amici.eth` subdomain keeps pointing at the last preview build indefinitely — merge/close handling isn't implemented.
- **omnipin is vendored as a plain nested clone**, not a git submodule (per explicit instruction when this was set up) — `amici`'s own git history won't track which upstream commit it's pinned to. Pulling updates means `cd omnipin && git fetch upstream && git merge upstream/main` by hand.
- **The second Zodiac permission (prerequisite 5) isn't generated for you** the way the resolver scope is via `omnipin zodiac` — it needs manual setup in the Zodiac Roles app's Conditions Builder, on purpose (see reasoning in prerequisite 5).
- **PR comments are opt-in and currently off** (see the `AMICI_ENSIPS_TOKEN` row above) — `PREVIEWS.md` and the Actions step summary are the only announcement channels until that token exists.
