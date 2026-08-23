import { del, get, post, put } from './http'
import type { RemoteControllerTemplate } from '@/types/remoteController'
import { parseRemoteControllerTemplate, parseRemoteControllerTemplateList } from '@/utils/remoteControllerSchema'

const PREFIX = '/api/remote-controller-templates'

const content = (template: RemoteControllerTemplate) => ({
  schema: template.schema,
  name: template.name,
  deviceTypes: template.deviceTypes,
  requiredCapabilities: template.requiredCapabilities,
  layout: template.layout,
  controls: template.controls,
})

export const listRemoteControllerTemplates = async () =>
  parseRemoteControllerTemplateList(await get<unknown>(PREFIX, { fallbackError: '遥控器模板加载失败' }))
export const createRemoteControllerTemplate = async (template: RemoteControllerTemplate) =>
  parseRemoteControllerTemplate(await post<unknown>(PREFIX, { id: template.id, ...content(template) }, { fallbackError: '遥控器模板创建失败' }))
export const updateRemoteControllerTemplate = async (template: RemoteControllerTemplate) =>
  parseRemoteControllerTemplate(await put<unknown>(`${PREFIX}/${encodeURIComponent(template.id)}`, {
    ...content(template), expectedRevision: template.revision,
  }, { fallbackError: '遥控器模板保存失败' }))
export const deleteRemoteControllerTemplate = (id: string, revision: number) =>
  del<void>(`${PREFIX}/${encodeURIComponent(id)}`, { query: { expectedRevision: revision }, fallbackError: '遥控器模板删除失败' })
export const restoreRemoteControllerTemplate = async (id: string, revision: number) =>
  parseRemoteControllerTemplate(await post<unknown>(`${PREFIX}/${encodeURIComponent(id)}/restore`, { expectedRevision: revision }, { fallbackError: '内置模板恢复失败' }))
