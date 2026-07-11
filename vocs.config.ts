import { remarkMermaid } from '@theguild/remark-mermaid'
import { defineConfig } from 'vocs/config'

export default defineConfig({
  title: 'ENSIP-27',
  titleTemplate: '%s · ENS Improvement Proposals',
  iconUrl: '/img/icon.svg',
  logoUrl: '/img/logo-mark.svg',
  // ENS blue — same value in both modes (Thorin's blue-primary hue is mode-invariant)
  accentColor: 'light-dark(#3889ff, #3889ff)',
  colorScheme: 'light dark',
  editLink: {
    pattern: 'https://github.com/ensdomains/ensips/edit/master/ensips/27.md',
    text: 'Edit on GitHub',
  },
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/ensdomains/ensips/pull/64',
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
          text: 'ENSIP-27: Node Classification and Metadata',
          link: '/ensip/27',
          badge: { text: 'Draft', variant: 'warning' },
        },
      ],
    },
  ],
  topNav: [
    { text: 'PR #64', link: 'https://github.com/ensdomains/ensips/pull/64' },
    { text: 'ENS Docs', link: 'https://docs.ens.domains' },
    { text: 'Thorin', link: 'https://thorin.ens.domains' },
  ],
})
