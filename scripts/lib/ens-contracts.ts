// Addresses/selectors verified against ensdomains/ens-contracts' own
// deployment records and interfaces — not guessed from memory.
export const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'

// Live-checked via enswhois: amici.eth is registered but NOT wrapped in
// NameWrapper (ownership.is_wrapped: false) and already resolves through
// the standard PublicResolver. Subname creation therefore goes through the
// base ENS Registry's own setSubnodeRecord (5 args, bytes32 label), NOT
// NameWrapper's same-named function (7 args, string label, fuses/expiry) —
// those are two different functions on two different contracts. If
// amici.eth is ever wrapped later, this needs to change to target
// NameWrapper instead.
//
// Verified with `cast sig "setSubnodeRecord(bytes32,bytes32,address,address,uint64)"`
// against the real ENS.sol interface (ensdomains/ens-contracts).
export const SET_SUBNODE_RECORD_SELECTOR = '0x5ef2c7f0'
