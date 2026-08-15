import { computed, onBeforeUnmount, ref } from 'vue'
import * as chatApi from '@/api/chat'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps, PendingUploadAttachment } from '@/types/chat'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const revokeUploadPreview = (item: PendingUploadAttachment) => {
  if (item.preview_url?.startsWith('blob:')) URL.revokeObjectURL(item.preview_url)
}

const clearUploadedAttachments = (uploaded: { value: PendingUploadAttachment[] }) => {
  uploaded.value.forEach(revokeUploadPreview)
  uploaded.value = []
}

const removeUploadedAttachment = (uploaded: { value: PendingUploadAttachment[] }, clientId: string) => {
  const item = uploaded.value.find(entry => entry.client_id === clientId)
  if (item) revokeUploadPreview(item)
  uploaded.value = uploaded.value.filter(entry => entry.client_id !== clientId)
}

const makePlaceholder = (file: File, clientId: string): PendingUploadAttachment => ({
  client_id: clientId,
  file_ref: '',
  workspace_path: '',
  file_name: file.name,
  mime_type: file.type || 'application/octet-stream',
  bytes: file.size,
  is_image: file.type.startsWith('image/'),
  preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  status: 'uploading',
})

const uploadOneFile = async (
  props: { state: ChatWorkspaceState; emit: ChatInterfaceEmitFn; dialogs: ChatDialogFns },
  uploaded: { value: PendingUploadAttachment[] },
  file: File,
) => {
  if (file.size > 30 * 1024 * 1024) {
    await props.dialogs.alert({ message: `${file.name} 超过 30 MB，未上传`, type: 'warning' })
    return
  }
  const clientId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`
  uploaded.value = [...uploaded.value, makePlaceholder(file, clientId)]
  try {
    const result = await chatApi.uploadChatAttachment(
      props.state.chatCtx.value,
      props.state.currentSessionId.value || 'default',
      file,
    )
    const index = uploaded.value.findIndex(item => item.client_id === clientId)
    if (index < 0) return
    const current = uploaded.value[index]
    uploaded.value[index] = { ...result, client_id: clientId, preview_url: current.preview_url, status: 'ready' }
    uploaded.value = [...uploaded.value]
    props.emit('refreshFiles')
  } catch (error: any) {
    removeUploadedAttachment(uploaded, clientId)
    await props.dialogs.alert({ message: `${file.name} 上传失败：${error?.message || '未知错误'}`, type: 'error' })
  }
}

const uploadLocalFiles = async (
  ctx: { state: ChatWorkspaceState; emit: ChatInterfaceEmitFn; dialogs: ChatDialogFns },
  uploaded: { value: PendingUploadAttachment[] },
  files: File[],
) => {
  const slots = Math.max(0, 5 - uploaded.value.length)
  if (slots <= 0) {
    await ctx.dialogs.alert({ message: '每条消息最多上传 5 个附件', type: 'warning' })
    return
  }
  const accepted = files.slice(0, slots)
  if (files.length > accepted.length) {
    await ctx.dialogs.alert({ message: '每条消息最多上传 5 个附件，超出的文件未加入', type: 'warning' })
  }
  for (const file of accepted) await uploadOneFile(ctx, uploaded, file)
}

export const useChatUploads = (
  _props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  emit: ChatInterfaceEmitFn,
  dialogs: ChatDialogFns,
) => {
  const uploadedAttachments = ref<PendingUploadAttachment[]>([])
  const uploadingCount = computed(() => uploadedAttachments.value.filter(item => item.status === 'uploading').length)
  const ctx = { state, emit, dialogs }
  onBeforeUnmount(() => clearUploadedAttachments(uploadedAttachments))
  return {
    uploadedAttachments,
    uploadingCount,
    clearUploadedAttachments: () => clearUploadedAttachments(uploadedAttachments),
    removeUploadedAttachment: (clientId: string) => removeUploadedAttachment(uploadedAttachments, clientId),
    uploadLocalFiles: (files: File[]) => uploadLocalFiles(ctx, uploadedAttachments, files),
  }
}

export type ChatUploadsApi = ReturnType<typeof useChatUploads>
