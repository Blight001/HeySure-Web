import { blockSignature, decodeStateFromTags } from '@/utils/chatActionState'
import type { ConversationMessage } from '@/utils/chatMessageNormalize'

export interface RecoveredActionState {
  appliedEdits: string[]
  appliedSignatures: string[]
  actionResults: Record<string, string>
  actionResultsBySignature: Record<string, string>
}

interface RecoveryDraft {
  appliedEdits: Set<string>
  appliedSignatures: Set<string>
  actionResults: Record<string, string>
  actionResultsBySignature: Record<string, string>
}

const emptyRecoveredState = (): RecoveredActionState => ({
  appliedEdits: [],
  appliedSignatures: [],
  actionResults: {},
  actionResultsBySignature: {},
})

const asStateRecord = (value: unknown): Record<string, any> =>
  (value && typeof value === 'object') ? value as Record<string, any> : {}

const applyBlockEntry = (blockId: string, blockStateRaw: unknown, draft: RecoveryDraft) => {
  const blockState = asStateRecord(blockStateRaw)
  if (blockState.applied) draft.appliedEdits.add(blockId)
  if (typeof blockState.result === 'string' && blockState.result.trim()) {
    draft.actionResults[blockId] = blockState.result
    draft.appliedEdits.add(blockId)
  }
}

const applySignatureEntry = (
  sig: string,
  sigStateRaw: unknown,
  mappedIds: string[],
  draft: RecoveryDraft,
) => {
  const sigState = asStateRecord(sigStateRaw)
  if (sigState.applied) draft.appliedSignatures.add(sig)
  if (typeof sigState.result === 'string' && sigState.result.trim()) {
    draft.actionResultsBySignature[sig] = sigState.result
  }
  for (const blockId of mappedIds) {
    if (sigState.applied) draft.appliedEdits.add(blockId)
    if (typeof sigState.result === 'string' && sigState.result.trim()) {
      draft.actionResults[blockId] = sigState.result
    }
  }
}

const collectMessageBlockIdsBySig = (msg: ConversationMessage) => {
  const msgBlockBySig: Record<string, string[]> = {}
  for (const block of msg.blocks || []) {
    const sig = blockSignature(block)
    if (!msgBlockBySig[sig]) msgBlockBySig[sig] = []
    msgBlockBySig[sig].push(String(block.id || ''))
  }
  return msgBlockBySig
}

const recoverFromMessage = (msg: ConversationMessage, draft: RecoveryDraft) => {
  const state = decodeStateFromTags(msg.tags)
  const blockStates = asStateRecord(state?.blocks)
  const signatureStates = asStateRecord(state?.signatures)
  const msgBlockBySig = collectMessageBlockIdsBySig(msg)
  for (const [blockId, blockStateRaw] of Object.entries(blockStates)) {
    applyBlockEntry(blockId, blockStateRaw, draft)
  }
  for (const [sig, sigStateRaw] of Object.entries(signatureStates)) {
    applySignatureEntry(sig, sigStateRaw, msgBlockBySig[sig] || [], draft)
  }
}

export const recoverActionStateFromMessages = (
  messages: ConversationMessage[],
  enabled: boolean,
): RecoveredActionState => {
  if (!enabled) return emptyRecoveredState()
  const draft: RecoveryDraft = {
    appliedEdits: new Set<string>(),
    appliedSignatures: new Set<string>(),
    actionResults: {},
    actionResultsBySignature: {},
  }
  for (const msg of messages) recoverFromMessage(msg, draft)
  return {
    appliedEdits: Array.from(draft.appliedEdits),
    appliedSignatures: Array.from(draft.appliedSignatures),
    actionResults: draft.actionResults,
    actionResultsBySignature: draft.actionResultsBySignature,
  }
}

export const mergeRecoveredActionState = (
  live: RecoveredActionState,
  recovered: RecoveredActionState,
): RecoveredActionState => ({
  appliedEdits: Array.from(new Set([...live.appliedEdits, ...recovered.appliedEdits])),
  appliedSignatures: Array.from(new Set([...live.appliedSignatures, ...recovered.appliedSignatures])),
  actionResults: { ...recovered.actionResults, ...live.actionResults },
  actionResultsBySignature: { ...recovered.actionResultsBySignature, ...live.actionResultsBySignature },
})
