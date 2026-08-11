import type { TooltipData } from './overlay'
import type { WorldMember, WorldSnapshot, WorldWorkshop } from '../world/store'

export interface WorkshopTooltipView {
  data: WorldWorkshop
  offlineSince: number | null
}

export const MEMBER_ROLE_LABELS: Record<WorldMember['role'], string> = {
  core_admin: '核心管理员',
  assistant_admin: '辅助管理员',
  librarian: '图书管理员',
  member: '数字成员',
}

export const workshopDisplayName = (workshop: WorldWorkshop): string => {
  const remark = String(workshop.remark || '').trim()
  return remark ? `${workshop.name}（${remark}）` : workshop.name
}

export const memberTooltipData = (member: WorldMember): TooltipData => {
  const ratio = member.tokenLimit > 0 ? member.tokensUsed / member.tokenLimit : undefined
  return {
    title: member.name,
    badge: `${MEMBER_ROLE_LABELS[member.role]} · 第 ${member.generation} 代`,
    tokenRatio: ratio,
    tokenText: member.tokenLimit > 0 ? `${member.tokensUsed} / ${member.tokenLimit}` : `${member.tokensUsed}（无上限）`,
    rows: [
      { label: '状态', value: member.lifecycle },
      { label: '行为', value: member.currentBehavior },
      { label: '任务', value: member.taskTitle ? `${member.taskTitle}（${member.taskStatus}）` : '' },
      { label: '工具', value: member.runtimeStatus === 'running' ? member.runtimeTool : '' },
      { label: '项目', value: member.projectName },
      { label: '模型', value: member.model },
      { label: '端侧', value: member.boundAgentIds.join(', ') },
    ],
  }
}

export const workshopTooltipData = (
  view: WorkshopTooltipView,
  boundMembers: WorldMember[],
): TooltipData => {
  const workshop = view.data
  const memberText = boundMembers.length
    ? boundMembers.map(member => `${member.name}（ID ${member.id}）`).join('、')
    : '未绑定（拖成员到此绑定）'
  if (workshop.type === 'workshop') {
    return {
      title: workshopDisplayName(workshop),
      badge: workshop.lifecycle === 'waiting' ? '等待连接' : view.offlineSince !== null ? '离线' : '在线',
      rows: [
        { label: '形态', value: '服务端内置 · 自动上线' },
        { label: '成员', value: memberText },
        { label: '说明', value: '支持多成员绑定，成员会在各自绑定设备间巡游' },
        { label: '工具', value: `${workshop.capabilities} 个知识/进化工具` },
        { label: '错误', value: workshop.lastError || '' },
      ],
    }
  }
  return {
    title: workshopDisplayName(workshop),
    badge: workshop.lifecycle === 'waiting' ? '等待连接' : view.offlineSince !== null ? '离线' : workshop.lifecycle === 'dispatching' ? '执行中' : '在线',
    rows: [
      { label: '设备', value: `${workshopDisplayName(workshop)}（${workshop.platform || 'unknown'}）` },
      { label: '成员', value: workshop.lifecycle === 'waiting' ? '连接后可分配' : memberText },
      { label: '工具', value: `${workshop.capabilities} 个端侧工具` },
      { label: '错误', value: workshop.lastError || '' },
    ],
  }
}

export const buildingTooltipData = (
  key: string,
  label: string,
  snap: WorldSnapshot | null,
): TooltipData => {
  const rows: { label: string; value: string }[] = []
  if (snap) {
    if (key === 'library') {
      rows.push({ label: '知识', value: `${snap.knowledgeActive} 条生效` })
    } else if (key === 'spawn') {
      const idle = snap.members.filter(
        member => member.lifecycle !== 'dead' && (!member.projectId || member.lifecycle === 'learning'),
      ).length
      rows.push({ label: '待分配', value: `${idle} 位成员` })
    }
  }
  return { title: label, rows }
}

export const hudHtml = (snap: WorldSnapshot, clock: string): string => {
  if (!snap.authOk) return `<div class="h-err">${snap.lastError || '连接中…'}</div>`

  const alive = snap.members.filter(member => member.lifecycle !== 'dead').length
  const online = snap.workshops.filter(workshop => workshop.online).length
  const running = snap.members.filter(member => member.runtimeStatus === 'running' || member.taskStatus === 'running').length
  return (
    `<div>存活成员 <b>${alive}</b> · 在线作坊 <b>${online}</b> · 干活中 <b>${running}</b></div>` +
    `<div>知识 <b>${snap.knowledgeActive}</b></div>` +
    `<div class="h-dim">🕐 ${clock}</div>`
  )
}
