// Single-ENSIP version of ensdomains/docs' scripts/ensips.ts (see
// ../../reference/docs/scripts/ensips.ts) — that script builds every ENSIP
// into one multi-page sidebar; amici instead builds one isolated site per
// draft, so this fetches and transforms exactly one ensips/{n}.md at a given
// git ref (a PR head SHA) instead of walking the whole ensdomains/ensips tree.
import matter from 'gray-matter'
import { type Tokens, marked } from 'marked'

export type EnsipFrontmatter = {
  title: string
  contributors: string[]
  ensip: {
    status: 'draft' | 'final' | 'obsolete'
    created: string
  }
}

export type TransformedEnsip = {
  number: number
  title: string
  authors: string[]
  created: string
  status: string
  /** Full contents to write to src/pages/ensip/{n}.mdx */
  mdx: string
}

export async function fetchAndTransformEnsip({
  number,
  ref,
}: {
  number: number
  ref: string
}): Promise<TransformedEnsip> {
  const raw = await fetchRawEnsip(number, ref)
  const parsedMd = matter(raw)

  const rawFrontmatter = parsedMd.matter
  const rawBody = await inlineSubdirectoryFiles(parsedMd.content, number, ref)
  const titleToken = getFirstHeadingToken(raw)
  if (!titleToken) throw new Error(`ensips/${number}.md has no H1 heading`)
  const titleLength = titleToken.raw.length

  const parsedFrontmatter = parsedMd.data as EnsipFrontmatter
  const authors = parsedFrontmatter.contributors ?? []
  const created = formatDate(parsedFrontmatter.ensip.created)
  const status = parsedFrontmatter.ensip.status

  const headerImport = 'import { EnsipHeader } from "../../components/EnsipHeader";\n'
  const headerJsx = `<EnsipHeader authors={[${authors.map((a) => `"${a}"`).join(',')}]} created="${created}" status="${status}" />`

  const mdx =
    '---' +
    rawFrontmatter +
    '\n---\n\n' +
    headerImport +
    rawBody.slice(0, titleLength) +
    '\n' +
    headerJsx +
    '\n' +
    processMarkdown(rawBody.slice(titleLength))

  return {
    number,
    title: titleToken.text,
    authors,
    created,
    status,
    mdx,
  }
}

async function fetchRawEnsip(number: number, ref: string): Promise<string> {
  const githubHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
  }
  if (process.env.GITHUB_TOKEN) {
    githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetchWithRetry(
    `https://api.github.com/repos/ensdomains/ensips/contents/ensips/${number}.md?ref=${ref}`,
    { headers: githubHeaders },
  )
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ensips/${number}.md at ${ref}: ${res.status} ${res.statusText}`,
    )
  }
  return res.text()
}

function getFirstHeadingToken(markdown: string) {
  const tokens = marked.lexer(markdown)
  return tokens.find(
    (token) => token.type === 'heading' && token.depth === 1,
  ) as Tokens.Heading | undefined
}

function formatDate(date: Date | string) {
  // ENSIP frontmatter dates are plain calendar dates (YYYY-MM-DD) with no
  // time component. `new Date("2025-12-15")` parses as UTC midnight, and
  // without an explicit timeZone here, Intl formats in the host's local
  // zone — rolling it back a day west of UTC. Force UTC so the displayed
  // date matches what's written in the source file everywhere it's built.
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date))
}

function processMarkdown(markdown: string) {
  return removeMarkdownComments(replaceRelativeLinks(markdown))
}

function replaceRelativeLinks(markdown: string) {
  // ./{number}.md -> /ensip/{number}
  return markdown.replace(/\.\/(\d+)\.md/g, '/ensip/$1')
}

function removeMarkdownComments(markdown: string) {
  return markdown.replace(/<!--[\s\S]*?-->/g, '')
}

async function inlineSubdirectoryFiles(
  markdown: string,
  ensipNumber: number,
  ref: string,
): Promise<string> {
  // Matches [](./NUMBER/file.md) — content inclusion directives some ENSIPs use
  const subfileLink = /\[\]\(\.\/\d+\/([^)]+\.md)\)/gm
  let result = markdown

  for (const match of markdown.matchAll(subfileLink)) {
    const [fullMatch, filename] = match
    const url = `https://raw.githubusercontent.com/ensdomains/ensips/${ref}/ensips/${ensipNumber}/${filename}`
    const res = await fetchWithRetry(url)
    if (res.ok) result = result.replace(fullMatch, await res.text())
  }

  return result
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options)
      if (res.ok || i === retries) return res
    } catch (e) {
      if (i === retries) throw e
    }
    await new Promise((r) => setTimeout(r, delay * (i + 1)))
  }
  throw new Error(`Failed to fetch ${url}`)
}
