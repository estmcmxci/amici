// The pipeline's entry point (run on a schedule by
// .github/workflows/amici-pipeline.yml). ensdomains/ensips gives no
// cross-repo webhook we can subscribe to, so instead of reacting to
// PR-open events we poll every open PR each run and diff against
// .amici-state.json to find what actually changed since last time.
//
// For each new/changed ensips/{n}.md: rebuild the isolated Vocs site for
// that ENSIP (build-ensip.ts), pin it via the vendored omnipin fork, and
// point {n}.amici.eth's contenthash at the new CID.
//
// Announcing the result: commenting on the source PR needs a token with
// write access to ensdomains/ensips, which amici doesn't have as of this
// writing (see README's "cross-repo comment permission" note) — so that
// step is opt-in via AMICI_ENSIPS_TOKEN and skipped entirely when unset,
// falling back to a GitHub Actions step summary + a committed PREVIEWS.md
// index, both of which only require authority over amici's own repo.
import fs from 'node:fs/promises'
import { execFileSync, execSync } from 'node:child_process'
import path from 'node:path'
import { buildEnsip } from './build-ensip.js'
import { generatePreviewsMarkdown } from './lib/previews.js'
import { readState, writeState } from './lib/state.js'
import { ensureSubnameExists } from './lib/subname.js'

const ENSIPS_REPO = 'ensdomains/ensips'
const ENSIP_FILE_RE = /^ensips\/(\d+)\.md$/

const OMNIPIN_CLI = path.join(process.cwd(), 'omnipin/dist/index.js')

type PrFile = { path: string }
type PrListItem = {
  number: number
  url: string
  headRefOid: string
  files: PrFile[]
}

async function main() {
  const required = ['AMICI_SIGNER_KEY', 'AMICI_SAFE', 'AMICI_ROLES_MOD_ADDRESS']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  const prs = listOpenEnsipPrs()
  const state = await readState()

  // Sequential on purpose: every build reuses the same template/ working
  // copy (see build-ensip.ts), so concurrent builds would clobber each other.
  for (const pr of prs) {
    for (const ensipNumber of ensipNumbersTouched(pr)) {
      const key = `${pr.number}:${ensipNumber}`
      const previous = state.prs[key]
      if (previous?.sha === pr.headRefOid) {
        console.log(`Skipping ENSIP-${ensipNumber} (PR #${pr.number}) — unchanged since ${previous.lastDeployedAt}`)
        continue
      }

      console.log(`Building ENSIP-${ensipNumber} from PR #${pr.number} @ ${pr.headRefOid}`)
      const built = await buildEnsip({
        number: ensipNumber,
        ref: pr.headRefOid,
        prNumber: pr.number,
        prUrl: pr.url,
      })

      const domain = `${ensipNumber}.amici.eth`

      const { alreadyExisted } = await ensureSubnameExists({
        ensipNumber,
        safe: process.env.AMICI_SAFE!,
        rolesModAddress: process.env.AMICI_ROLES_MOD_ADDRESS! as `0x${string}`,
      })
      if (!alreadyExisted) console.log(`Created ${domain}`)

      deployToIpfsAndEns({ distDir: built.distDir, domain })

      await announce({
        prNumber: pr.number,
        prUrl: pr.url,
        ensipNumber,
        domain,
        status: built.status,
      })

      state.prs[key] = {
        ensipNumber,
        sha: pr.headRefOid,
        lastDeployedAt: new Date().toISOString(),
        prUrl: pr.url,
        status: built.status,
      }
      await writeState(state)
      await fs.writeFile('PREVIEWS.md', generatePreviewsMarkdown(state), 'utf-8')
    }
  }
}

function listOpenEnsipPrs(): PrListItem[] {
  const raw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      ENSIPS_REPO,
      '--state',
      'open',
      '--json',
      'number,headRefOid,url,files',
      '--limit',
      '100',
    ],
    { encoding: 'utf-8' },
  )
  return JSON.parse(raw)
}

function ensipNumbersTouched(pr: PrListItem): number[] {
  const numbers = new Set<number>()
  for (const file of pr.files) {
    const match = file.path.match(ENSIP_FILE_RE)
    if (match) numbers.add(Number(match[1]))
  }
  return [...numbers]
}

function deployToIpfsAndEns({ distDir, domain }: { distDir: string; domain: string }) {
  execFileSync(
    'node',
    [
      OMNIPIN_CLI,
      'deploy',
      distDir,
      '--strict',
      '--ens',
      domain,
      '--safe',
      process.env.AMICI_SAFE!,
      '--roles-mod-address',
      process.env.AMICI_ROLES_MOD_ADDRESS!,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        // omnipin reads OMNIPIN_PK, not AMICI_SIGNER_KEY — the rename keeps
        // the secret's purpose (a scoped ENS operator key, not an owner key)
        // explicit at the point it's provisioned in the GitHub repo settings.
        OMNIPIN_PK: process.env.AMICI_SIGNER_KEY,
      },
    },
  )
}

async function announce({
  prNumber,
  prUrl,
  ensipNumber,
  domain,
  status,
}: {
  prNumber: number
  prUrl: string
  ensipNumber: number
  domain: string
  status: string
}) {
  const body = [
    `**ENSIP-${ensipNumber} preview** (${status}) is live:`,
    '',
    `- https://${domain}.limo`,
    `- https://${domain}.link`,
    '',
    `Source: [ensdomains/ensips#${prNumber}](${prUrl})`,
  ].join('\n')

  // Always available: writes to this run's own Actions summary, which only
  // requires authority over amici's own repo/run.
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${body}\n\n---\n\n`, 'utf-8')
  } else {
    console.log(body)
  }

  // Opt-in: commenting on the source PR needs write access to
  // ensdomains/ensips, an external repo amici doesn't own. Skip cleanly
  // rather than fail the run when that token doesn't exist yet.
  if (!process.env.AMICI_ENSIPS_TOKEN) {
    console.log(`AMICI_ENSIPS_TOKEN not set — skipping PR comment on #${prNumber}`)
    return
  }

  execSync(
    `gh pr comment ${prNumber} --repo ${ENSIPS_REPO} --create-if-none --edit-last --body-file -`,
    {
      input: body,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, GH_TOKEN: process.env.AMICI_ENSIPS_TOKEN },
    },
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
