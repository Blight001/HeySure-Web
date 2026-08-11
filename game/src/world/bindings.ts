import { setDeviceMemberBinding } from '@/api/devices'
import { setWorkshopBinding } from '@/api/workshop'
import { gameConfirm } from '../ui/confirmDialog'
import type { WorldMember, WorldSnapshot } from './store'

export type DropTarget = { kind: 'workshop'; deviceId: string } | { kind: 'spawn' }

export const applyMemberDropBinding = async (
  member: WorldMember,
  drop: DropTarget,
  snap: WorldSnapshot,
  refresh: () => Promise<void>,
): Promise<void> => {
  if (drop.kind === 'workshop') {
    const workshop = snap.workshops.find(item => item.deviceId === drop.deviceId)
    if (!workshop) return
    if (workshop.type === 'workshop') {
      const ok = await gameConfirm({
        title: '确认绑定',
        message: `把成员「${member.name}」绑定到 ${workshop.name}？\n同一设备可绑定多位成员，各自权限互不影响。`,
        confirmText: '绑定',
      })
      if (ok) {
        void setWorkshopBinding(member.id, workshop.deviceId, true).then(refresh).catch(() => undefined)
      }
    } else {
      const ok = await gameConfirm({
        title: '确认绑定',
        message: `把成员「${member.name}」绑定到 ${workshop.name}？`,
        confirmText: '绑定',
      })
      if (ok) {
        void setDeviceMemberBinding(workshop.deviceId, member.id, true).then(refresh).catch(() => undefined)
      }
    }
    return
  }

  if (!member.boundAgentIds.length) return
  const ok = await gameConfirm({
    title: '确认解绑',
    message: `把成员「${member.name}」从端侧 agent / 图书馆上解绑？`,
    confirmText: '解绑',
    tone: 'warn',
  })
  if (ok) {
    void Promise.all(member.boundAgentIds.map(deviceId => {
      const workshop = snap.workshops.find(item => item.deviceId === deviceId)
      return workshop?.type === 'workshop'
        ? setWorkshopBinding(member.id, deviceId, false)
        : setDeviceMemberBinding(deviceId, member.id, false)
    }))
      .then(refresh)
      .catch(() => undefined)
  }
}
