import { type WalletSession, parseWalletSession } from './walletSession'

const RECOVERY_FILE_TYPE = 'webwallet-recovery'
const RECOVERY_FILE_VERSION = 1

type RecoveryFilePayload = WalletSession

type RecoveryFileRecord = {
  checksum: string
  payload: RecoveryFilePayload
  type: typeof RECOVERY_FILE_TYPE
  version: typeof RECOVERY_FILE_VERSION
}

function serializePayload(payload: RecoveryFilePayload) {
  return JSON.stringify({
    createdAt: payload.createdAt,
    credential: {
      id: payload.credential.id,
      publicKey: payload.credential.publicKey,
    },
    label: payload.label,
    rpId: payload.rpId,
    version: payload.version,
  })
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))

  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function createRecoveryFileRecord(session: WalletSession): Promise<RecoveryFileRecord> {
  const payload = {
    createdAt: session.createdAt,
    credential: {
      id: session.credential.id,
      publicKey: session.credential.publicKey,
    },
    label: session.label,
    rpId: session.rpId,
    version: session.version,
  } satisfies RecoveryFilePayload

  return {
    checksum: await sha256Hex(serializePayload(payload)),
    payload,
    type: RECOVERY_FILE_TYPE,
    version: RECOVERY_FILE_VERSION,
  }
}

export async function serializeRecoveryFile(session: WalletSession) {
  const record = await createRecoveryFileRecord(session)
  return JSON.stringify(record, null, 2)
}

export async function parseRecoveryFile(text: string): Promise<WalletSession> {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Recovery file is not valid JSON.')
  }

  const record = parsed as RecoveryFileRecord

  if (record?.type !== RECOVERY_FILE_TYPE || record?.version !== RECOVERY_FILE_VERSION) {
    throw new Error('Recovery file version is not supported.')
  }

  const payload = parseWalletSession(record.payload)
  if (!payload) {
    throw new Error('Recovery file payload is invalid.')
  }

  const expectedChecksum = await sha256Hex(serializePayload(payload))
  if (record.checksum !== expectedChecksum) {
    throw new Error('Recovery file checksum is invalid.')
  }

  return payload
}

export async function triggerRecoveryFileDownload(session: WalletSession) {
  const text = await serializeRecoveryFile(session)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const createdAtPrefix = session.createdAt.slice(0, 10)

  anchor.href = url
  anchor.download = `webwallet-recovery-${createdAtPrefix}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
