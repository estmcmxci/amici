// Creates the `{n}.amici.eth` subname the first time it's needed. omnipin
// itself never does this (verified — grepped the whole fork for
// subdomain/subname/wildcard/NameWrapper: zero hits); it only ever calls
// setContenthash on a name that already has an owner in the ENS Registry.
// For the standard PublicResolver, that owner has to exist *before*
// setContenthash's authorised(node) check can pass for anyone — see
// README's "Manual prerequisites" §4 for the verified reasoning.
//
// amici.eth is live-confirmed (via enswhois) as registered but NOT wrapped
// in NameWrapper, and already using the standard PublicResolver — so this
// targets the base ENS Registry's own setSubnodeRecord(bytes32 node,
// bytes32 label, address owner, address resolver, uint64 ttl), not
// NameWrapper's same-named-but-different function (string label,
// fuses/expiry). If amici.eth is ever wrapped later, this needs to change.
//
// Reuses omnipin's own vetted execution path (execTransactionWithRole) so
// this goes through the exact same Zodiac Roles Modifier call the
// contenthash update does — just against the Registry instead of the
// resolver. That target contract needs its OWN scoped permission added to
// the Roles Modifier (see README) before this will succeed on-chain; if it
// isn't set up yet, the tx simulation fails silently inside omnipin's own
// exec helper, so this re-checks ownership afterward and throws a clear
// error naming the likely cause rather than failing mysteriously one step
// later at the contenthash call.
import { encodeData, decodeResult } from 'ox/AbiFunction'
import { checksum, fromPublicKey } from 'ox/Address'
import { labelhash, namehash, normalize } from 'ox/Ens'
import type { Hex } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import { chains } from '../../omnipin/src/constants.js'
import { getExactAddress } from '../../omnipin/src/utils/address/getExactAddress.js'
import { chainToRpcUrl } from '../../omnipin/src/utils/ens.js'
import { getEnsResolver } from '../../omnipin/src/utils/ens/get-resolver.js'
import { execTransactionWithRole } from '../../omnipin/src/utils/zodiac-roles/exec.js'
import { ENS_REGISTRY_ADDRESS, SET_SUBNODE_RECORD_SELECTOR } from './ens-contracts.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const ownerAbi = {
  type: 'function',
  name: 'owner',
  inputs: [{ name: 'node', type: 'bytes32' }],
  outputs: [{ name: '', type: 'address' }],
  stateMutability: 'view',
} as const

const setSubnodeRecordAbi = {
  type: 'function',
  name: 'setSubnodeRecord',
  inputs: [
    { name: 'node', type: 'bytes32' },
    { name: 'label', type: 'bytes32' },
    { name: 'owner', type: 'address' },
    { name: 'resolver', type: 'address' },
    { name: 'ttl', type: 'uint64' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
} as const

export type ChainName = 'mainnet' | 'sepolia'

export async function ensureSubnameExists({
  ensipNumber,
  parentName = 'amici.eth',
  chainName = 'mainnet',
  safe,
  rolesModAddress,
}: {
  ensipNumber: number
  parentName?: string
  chainName?: ChainName
  /** Same formats omnipin's own --safe flag accepts: a plain 0x address, an EIP-3770 `eth:0x...` address, or an ENS name. */
  safe: string
  rolesModAddress: `0x${string}`
}): Promise<{ alreadyExisted: boolean }> {
  const domain = `${ensipNumber}.${parentName}`
  const chain = chains[chainName]
  const provider = Provider.from(fromHttp(chainToRpcUrl(chainName)))
  const node = namehash(normalize(domain))

  if (await readRegistryOwner(provider, node)) return { alreadyExisted: true }

  console.log(`${domain} has no owner in the ENS Registry yet — creating it via ENS Registry.setSubnodeRecord`)

  const safeAddress = await getExactAddress({ chain, addressOrEns: safe, provider })
  const parentResolver = await getEnsResolver({ provider, name: parentName })
  const pk = process.env.AMICI_SIGNER_KEY as Hex
  const roleAddress = checksum(fromPublicKey(getPublicKey({ privateKey: pk })))

  const data = encodeData(setSubnodeRecordAbi, [
    namehash(normalize(parentName)),
    labelhash(String(ensipNumber)),
    safeAddress, // owner: the Safe, never the CI signer — the pipeline only
    // ever holds a scoped role, so ownership can't end up with an attacker
    // even if this key is compromised.
    parentResolver, // new subnames reuse amici.eth's own resolver
    0n, // ttl
  ])

  await execTransactionWithRole({
    provider,
    resolverAddress: ENS_REGISTRY_ADDRESS,
    data,
    rolesModAddress,
    from: roleAddress,
    privateKey: pk,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers.default.url,
  })

  if (!(await readRegistryOwner(provider, node))) {
    throw new Error(
      `${domain} still has no owner after attempting setSubnodeRecord. Likely cause: the Zodiac Roles Modifier ` +
        `hasn't been scoped to allow setSubnodeRecord (selector ${SET_SUBNODE_RECORD_SELECTOR}) ` +
        `on the ENS Registry (${ENS_REGISTRY_ADDRESS}) yet — see README's "Manual prerequisites" §4-5.`,
    )
  }

  return { alreadyExisted: false }
}

async function readRegistryOwner(
  provider: ReturnType<typeof Provider.from>,
  node: Hex,
): Promise<boolean> {
  const result = await provider.request({
    method: 'eth_call',
    params: [{ to: ENS_REGISTRY_ADDRESS, data: encodeData(ownerAbi, [node]) }, 'latest'],
  })
  // decodeResult returns the bare value (not a tuple) for a single-output
  // ABI like this one — destructuring it as `[owner]` silently grabs the
  // first character of the address string instead of the address itself.
  const owner = decodeResult(ownerAbi, result)
  return checksum(owner) !== checksum(ZERO_ADDRESS)
}
