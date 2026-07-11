// Writes a generated vocs.config.ts + homepage + ensip/{n}.mdx into
// template/, then runs `vocs build` there. One ENSIP at a time — the
// caller (poll-ensips.ts) is expected to `npm ci` in template/ once
// up front and re-run this per changed ENSIP, not reinstall each time.
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchAndTransformEnsip } from './lib/ensip-transform.js'

const TEMPLATE_DIR = path.join(process.cwd(), 'template')

const STATUS_BADGE_VARIANT: Record<string, string> = {
  draft: 'warning',
  final: 'success',
  obsolete: 'note',
}

export type BuildEnsipArgs = {
  number: number
  ref: string
  prNumber: number
  prUrl: string
}

export type BuildEnsipResult = {
  distDir: string
  title: string
  status: string
}

export async function buildEnsip({
  number,
  ref,
  prNumber,
  prUrl,
}: BuildEnsipArgs): Promise<BuildEnsipResult> {
  const ensip = await fetchAndTransformEnsip({ number, ref })

  await clearPreviousEnsipPages(number)

  await fs.writeFile(
    path.join(TEMPLATE_DIR, 'vocs.config.ts'),
    generateVocsConfig({ ensip, prNumber, prUrl }),
    'utf-8',
  )
  await fs.writeFile(
    path.join(TEMPLATE_DIR, 'src/pages/index.mdx'),
    generateHomepage({ ensip, prNumber, prUrl }),
    'utf-8',
  )
  await fs.writeFile(
    path.join(TEMPLATE_DIR, `src/pages/ensip/${number}.mdx`),
    ensip.mdx,
    'utf-8',
  )

  execSync('npm run build', { cwd: TEMPLATE_DIR, stdio: 'inherit' })

  return {
    distDir: path.join(TEMPLATE_DIR, 'dist'),
    title: ensip.title,
    status: ensip.status,
  }
}

// Each amici subdomain is scoped to exactly one ENSIP; strip any {n}.mdx
// left behind by a previous build in this same template/ checkout so Vocs
// doesn't emit routes for an ENSIP this deploy isn't about.
async function clearPreviousEnsipPages(keepNumber: number) {
  const ensipDir = path.join(TEMPLATE_DIR, 'src/pages/ensip')
  const entries = await fs.readdir(ensipDir).catch(() => [] as string[])
  await Promise.all(
    entries
      .filter((f) => f !== 'index.mdx' && f !== `${keepNumber}.mdx`)
      .map((f) => fs.rm(path.join(ensipDir, f))),
  )
}

function generateVocsConfig({
  ensip,
  prNumber,
  prUrl,
}: {
  ensip: Awaited<ReturnType<typeof fetchAndTransformEnsip>>
  prNumber: number
  prUrl: string
}) {
  const variant = STATUS_BADGE_VARIANT[ensip.status] ?? 'note'
  return `import { remarkMermaid } from '@theguild/remark-mermaid'
import { defineConfig } from 'vocs/config'

export default defineConfig({
  title: 'ENSIP-${ensip.number}',
  titleTemplate: '%s · ENS Improvement Proposals',
  iconUrl: '/img/icon.svg',
  logoUrl: '/img/logo-mark.svg',
  // ENS blue — same value in both modes (Thorin's blue-primary hue is mode-invariant)
  accentColor: 'light-dark(#3889ff, #3889ff)',
  colorScheme: 'light dark',
  editLink: {
    pattern: 'https://github.com/ensdomains/ensips/edit/master/ensips/${ensip.number}.md',
    text: 'Edit on GitHub',
  },
  socials: [
    {
      icon: 'github',
      link: '${prUrl}',
    },
  ],
  markdown: {
    remarkPlugins: [remarkMermaid],
  },
  sidebar: [
    {
      text: 'Improvement Proposals',
      items: [
        {
          text: 'What is an ENSIP?',
          link: '/ensip',
        },
        {
          // ensip.title is the full H1 text and already reads "ENSIP-N: ...",
          // per the "# ENSIP-N: Title" convention — don't re-prefix it.
          text: '${ensip.title}',
          link: '/ensip/${ensip.number}',
          badge: { text: '${capitalize(ensip.status)}', variant: '${variant}' },
        },
      ],
    },
  ],
  topNav: [
    { text: 'PR #${prNumber}', link: '${prUrl}' },
    { text: 'ENS Docs', link: 'https://docs.ens.domains' },
    { text: 'Thorin', link: 'https://thorin.ens.domains' },
  ],
})
`
}

function generateHomepage({
  ensip,
  prNumber,
  prUrl,
}: {
  ensip: Awaited<ReturnType<typeof fetchAndTransformEnsip>>
  prNumber: number
  prUrl: string
}) {
  return `# ENSIP-${ensip.number} Preview

This is a standalone Vocs site built with the same stack as [docs.ens.domains](https://docs.ens.domains): [Vocs](https://vocs.dev) for the docs framework, and design tokens sourced from [Thorin](https://thorin.ens.domains), ENS's design system.

It exists to make one draft proposal easy to read:

## [${ensip.title} &rarr;](/ensip/${ensip.number})

Currently in **${ensip.status}** status, tracking [ensdomains/ensips#${prNumber}](${prUrl}).

This preview is rebuilt automatically whenever the source pull request changes.
`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// CLI entry point for local testing:
//   npx tsx scripts/build-ensip.ts --number 27 --ref main --pr-number 64 --pr-url https://github.com/ensdomains/ensips/pull/64
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }
  const number = Number(get('--number'))
  const ref = get('--ref')
  const prNumber = Number(get('--pr-number'))
  const prUrl = get('--pr-url')
  if (!number || !ref || !prNumber || !prUrl) {
    console.error(
      'Usage: build-ensip.ts --number <n> --ref <sha> --pr-number <n> --pr-url <url>',
    )
    process.exit(1)
  }
  buildEnsip({ number, ref, prNumber, prUrl }).then((result) => {
    console.log(`Built ENSIP-${number} (${result.status}) -> ${result.distDir}`)
  })
}
