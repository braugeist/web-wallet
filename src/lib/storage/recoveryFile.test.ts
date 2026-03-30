import { describe, expect, it } from 'vitest'

import {
  createRecoveryFileRecord,
  parseRecoveryFile,
  serializeRecoveryFile,
} from './recoveryFile'
import type { WalletSession } from './walletSession'

const session: WalletSession = {
  createdAt: '2026-03-30T22:00:00.000Z',
  credential: {
    id: 'credential-id',
    publicKey: '0x1234abcd',
  },
  label: 'WebWallet',
  rpId: 'wallet.example',
  version: 1,
}

describe('recovery file', () => {
  it('serializes and parses a valid recovery file', async () => {
    const text = await serializeRecoveryFile(session)

    await expect(parseRecoveryFile(text)).resolves.toEqual(session)
  })

  it('computes a checksum for the payload', async () => {
    const record = await createRecoveryFileRecord(session)

    expect(record.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects invalid checksums', async () => {
    const text = await serializeRecoveryFile(session)
    const tampered = JSON.stringify({
      ...JSON.parse(text),
      checksum: 'deadbeef',
    })

    await expect(parseRecoveryFile(tampered)).rejects.toThrow(
      'Recovery file checksum is invalid.',
    )
  })

  it('rejects invalid payloads', async () => {
    const invalid = JSON.stringify({
      checksum: '0'.repeat(64),
      payload: { foo: 'bar' },
      type: 'webwallet-recovery',
      version: 1,
    })

    await expect(parseRecoveryFile(invalid)).rejects.toThrow(
      'Recovery file payload is invalid.',
    )
  })
})
