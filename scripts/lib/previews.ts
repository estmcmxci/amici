// Regenerated in full from .amici-state.json on every poll run. Exists
// because posting the live link back on the source PR needs a token amici
// doesn't have yet (see README's "cross-repo comment permission" note) — so
// until that's available, this committed file is the answer to "where do I
// find the preview link".
import type { AmiciState } from './state.js'

export function generatePreviewsMarkdown(state: AmiciState): string {
  const entries = Object.entries(state.prs).sort(
    ([, a], [, b]) => a.ensipNumber - b.ensipNumber,
  )

  const rows = entries.map(
    ([, entry]) =>
      `| ENSIP-${entry.ensipNumber} | ${entry.status} | [${entry.prUrl.replace('https://github.com/', '')}](${entry.prUrl}) | https://${entry.ensipNumber}.amici.eth.limo | ${entry.lastDeployedAt} |`,
  )

  return `# Live ENSIP previews

Regenerated automatically by \`scripts/poll-ensips.ts\` on every pipeline run — do not edit by hand.

| ENSIP | Status | Source PR | Preview | Last deployed |
|---|---|---|---|---|
${rows.length ? rows.join('\n') : '| _none yet_ | | | | |'}
`
}
