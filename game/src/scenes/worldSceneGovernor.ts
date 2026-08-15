import Phaser from 'phaser'
import { MemberActor } from '../actors/MemberActor'
import { INTERACT_RANGE } from '../world/workshops'
import { playSfx } from './worldSceneAmbient'
import { focusMemberCard } from './worldSceneMembers'
import { isTextInputFocused } from './worldSceneShared'
import type { WorldSceneHost } from './worldSceneTypes'

export const createGovernor = (scene: WorldSceneHost) => {
  scene.interactPrompt = scene.add.text(0, 0, '按 F 交互', {
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    color: '#fff7d6',
    backgroundColor: '#2a2410cc',
    padding: { x: 6, y: 2 },
  })
  scene.interactPrompt.setOrigin(0.5, 1)
  scene.interactPrompt.setDepth(200000)
  scene.interactPrompt.setVisible(false)
}

export const attachGovernorControls = (scene: WorldSceneHost) => {
  const kb = scene.input.keyboard
  if (kb) {
    scene.moveKeys = kb.addKeys('W,A,S,D', false) as Record<string, Phaser.Input.Keyboard.Key>
    kb.on('keydown-F', () => tryInteract(scene))
    kb.on('keydown-G', () => {
      if (!isTextInputFocused()) setGovernorMode(scene, !scene.governorMode)
    })
    kb.on('keydown-M', () => {
      if (!isTextInputFocused()) scene.overlay.toggleMasterMute()
    })
  }
  scene.overlay.initGovernorButton(document.body, scene.governorMode, active => setGovernorMode(scene, active))
  scene.overlay.initVirtualPad(document.body, () => tryInteract(scene))
}

export const governorActor = (scene: WorldSceneHost): MemberActor | null => {
  const m = scene.snap?.members.find(x => x.role === 'assistant_admin' && x.lifecycle !== 'dead')
  if (!m) return null
  return scene.actors.get(m.id) ?? null
}

export const setGovernorMode = (scene: WorldSceneHost, on: boolean) => {
  if (on === scene.governorMode) return
  if (on) enableGovernor(scene)
  else disableGovernor(scene)
  scene.overlay.setGovernorActive(scene.governorMode)
}

const enableGovernor = (scene: WorldSceneHost) => {
  const cam = scene.cameras.main
  const gov = governorActor(scene)
  if (!gov) {
    scene.overlay.flashGovernorHint('世界里暂无辅助管理员可操控')
    scene.overlay.setGovernorActive(false)
    return
  }
  scene.governorMode = true
  scene.governorId = gov.memberId
  gov.setControlled(true)
  cam.stopFollow()
  cam.startFollow(gov, true, 0.12, 0.12)
  if (cam.zoom < 1) cam.zoomTo(Math.min(1.3, Math.max(1, cam.zoom)), 500, 'Sine.easeInOut')
}

const disableGovernor = (scene: WorldSceneHost) => {
  scene.governorMode = false
  const gov = scene.governorId !== null ? scene.actors.get(scene.governorId) : null
  gov?.setControlled(false)
  scene.governorId = null
  scene.cameras.main.stopFollow()
  scene.interactPrompt.setVisible(false)
  scene.nearestInteractId = null
}

export const tryInteract = (scene: WorldSceneHost) => {
  if (!scene.governorMode || isTextInputFocused()) return
  if (scene.nearestInteractId === null || !scene.snap) return
  const m = scene.snap.members.find(x => x.id === scene.nearestInteractId)
  if (!m) return
  focusMemberCard(scene, m.id)
  playSfx(scene, 'ui_click', 0.4)
}

export const updateGovernor = (scene: WorldSceneHost) => {
  const gov = scene.governorMode ? governorActor(scene) : null
  if (scene.governorMode && !gov) {
    setGovernorMode(scene, false)
    return
  }
  if (!gov) {
    scene.interactPrompt.setVisible(false)
    scene.nearestInteractId = null
    return
  }
  gov.setControlVelocity(...readGovernorStick(scene))
  updateInteractPrompt(scene, gov)
}

const readGovernorStick = (scene: WorldSceneHost): [number, number] => {
  if (isTextInputFocused()) return [0, 0]
  let dx = 0
  let dy = 0
  if (scene.moveKeys) {
    if (scene.moveKeys.A?.isDown) dx -= 1
    if (scene.moveKeys.D?.isDown) dx += 1
    if (scene.moveKeys.W?.isDown) dy -= 1
    if (scene.moveKeys.S?.isDown) dy += 1
  }
  const pad = scene.overlay.getPadDirection()
  if (pad.dx !== 0 || pad.dy !== 0) return [pad.dx, pad.dy]
  return [dx, dy]
}

const updateInteractPrompt = (scene: WorldSceneHost, gov: MemberActor) => {
  const best = nearestInteractActor(scene, gov)
  if (best) {
    scene.nearestInteractId = best.memberId
    scene.interactPrompt.setPosition(best.x, best.y - 92)
    scene.interactPrompt.setText(scene.overlay.isTouchUi() ? '靠近可交互' : '按 F 交互')
    scene.interactPrompt.setVisible(true)
    scene.overlay.setPadInteractReady(true)
    return
  }
  scene.nearestInteractId = null
  scene.interactPrompt.setVisible(false)
  scene.overlay.setPadInteractReady(false)
}

const nearestInteractActor = (scene: WorldSceneHost, gov: MemberActor): MemberActor | null => {
  let best: MemberActor | null = null
  let bestDist = INTERACT_RANGE
  for (const actor of scene.actors.values()) {
    if (actor === gov || actor.isDying) continue
    const d = Phaser.Math.Distance.Between(gov.x, gov.y, actor.x, actor.y)
    if (d < bestDist) {
      bestDist = d
      best = actor
    }
  }
  return best
}
