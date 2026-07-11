import fs from 'node:fs/promises'
import path from 'node:path'

const STATE_PATH = path.join(process.cwd(), '.amici-state.json')

export type PrState = {
  ensipNumber: number
  sha: string
  lastDeployedAt: string
  prUrl: string
  status: string
}

export type AmiciState = {
  prs: Record<string, PrState>
}

export async function readState(): Promise<AmiciState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8')
    return JSON.parse(raw) as AmiciState
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { prs: {} }
    throw e
  }
}

export async function writeState(state: AmiciState): Promise<void> {
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}
