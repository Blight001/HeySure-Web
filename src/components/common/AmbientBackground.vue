<script setup lang="ts">
/**
 * 全局氛围背景：多层深空星野 canvas + 鼠标跟随光晕。
 *
 * 由远及近分四层，营造太空纵深感：
 *  1. 远景星野 —— 大量微小星点，极慢漂移 + 随机相位闪烁（twinkle）；
 *  2. 中景亮星 —— 更大更亮、带柔光，少数带十字衍射光芒，冷色系带轻微色差；
 *  3. 流星 —— 随机间隔划过，头部亮点 + 线性渐隐尾迹；
 *  4. 近景星座 —— 节点缓慢漂移并按距离连线；鼠标互动开启时，靠近光标的
 *     粒子被轻微推开并与光标连线，光晕以 lerp 弹性跟随。
 * 远/中层随光标位置做反向视差偏移（远层动得少、中层动得多），增强空间感。
 *
 * - 星野/星座/流星受 useUiEffects 的 particles 偏好控制，光晕与视差受
 *   mouseGlow 控制，可在设置 → 界面偏好中实时切换。
 * - variant="dark" 用于始终深色的页面（如首页），忽略 html 上的主题类。
 * - 颜色随亮/暗主题自适应；prefers-reduced-motion 时整体禁用；
 *   标签页隐藏时暂停渲染。
 * - 移动端：缓冲区尺寸取 canvas 自身盒子（而非 window.innerWidth/Height），
 *   避免地址栏/软键盘导致宽高比错位被拉伸；触屏通过 pointer 事件互动，
 *   抬手后光晕淡出；小屏降低各层密度与连线距离以保证性能。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useUiEffects } from '@/composables/useUiEffects'

const props = withDefaults(defineProps<{ variant?: 'auto' | 'dark' }>(), { variant: 'auto' })

const { effects } = useUiEffects()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const glowEl = ref<HTMLElement | null>(null)

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const TAU = Math.PI * 2

type Node = { x: number; y: number; vx: number; vy: number; r: number }
type Star = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  colorIdx: number
  spike: boolean
}
type Meteor = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }

// 星点冷色系配色（'r, g, b'）：蓝白为主，点缀靛/青/紫，极少数暖星。
// 亮/暗两套按下标一一对应，主题切换时无需重建星野。
const DARK_STAR_COLORS = ['226, 232, 255', '165, 180, 252', '165, 243, 252', '221, 214, 254', '254, 240, 199']
const LIGHT_STAR_COLORS = ['99, 102, 241', '79, 70, 229', '8, 145, 178', '124, 58, 237', '217, 119, 6']
const STAR_COLOR_WEIGHTS = [0.55, 0.2, 0.12, 0.08, 0.05]

const pickColorIdx = () => {
  let roll = Math.random()
  for (let i = 0; i < STAR_COLOR_WEIGHTS.length; i++) {
    roll -= STAR_COLOR_WEIGHTS[i]
    if (roll <= 0) return i
  }
  return 0
}

let nodes: Node[] = []
let farStars: Star[] = []
let midStars: Star[] = []
let meteors: Meteor[] = []
let nextMeteorAt = 0
let width = 0
let height = 0
let raf = 0
let running = false
let lastTime = 0
let resizeObserver: ResizeObserver | null = null
const mouse = { x: -9999, y: -9999, active: false }
const glowPos = { x: -9999, y: -9999 }
// 视差偏移量（-0.5..0.5 的屏幕相对坐标，lerp 平滑）
const parallax = { x: 0, y: 0 }

// 小屏下缩短连线距离、降低密度，避免画面拥挤且省电
let linkDist = 130
let mouseDist = 170

const isDark = () =>
  props.variant === 'dark' || document.documentElement.classList.contains('dark')

const makeNode = (): Node => ({
  x: Math.random() * width,
  y: Math.random() * height,
  vx: (Math.random() - 0.5) * 0.32,
  vy: (Math.random() - 0.5) * 0.32,
  r: 1 + Math.random() * 1.5,
})

const makeStar = (layer: 'far' | 'mid'): Star => {
  const far = layer === 'far'
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    r: far ? 0.3 + Math.random() * 0.7 : 0.7 + Math.random() * 1.1,
    vx: (Math.random() - 0.5) * (far ? 0.045 : 0.085),
    vy: (Math.random() - 0.5) * (far ? 0.045 : 0.085),
    baseAlpha: far ? 0.25 + Math.random() * 0.4 : 0.4 + Math.random() * 0.45,
    twinkleSpeed: 0.4 + Math.random() * 1.8,
    twinklePhase: Math.random() * TAU,
    colorIdx: pickColorIdx(),
    spike: !far && Math.random() < 0.12,
  }
}

const clampCount = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.floor(value)))

const syncCount = <T,>(arr: T[], count: number, make: () => T) => {
  while (arr.length > count) arr.pop()
  while (arr.length < count) arr.push(make())
}

const resize = () => {
  const canvas = canvasEl.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  // 以 canvas 自身盒子为准：缓冲区与 CSS 显示尺寸宽高比始终一致，
  // 移动端地址栏收起/软键盘弹出时不会被拉伸压扁
  const rect = canvas.getBoundingClientRect()
  const newWidth = Math.max(1, Math.round(rect.width))
  const newHeight = Math.max(1, Math.round(rect.height))
  // 已有粒子按比例映射到新尺寸，地址栏频繁伸缩时画面不闪变
  if (width > 0 && height > 0) {
    const sx = newWidth / width
    const sy = newHeight / height
    for (const arr of [nodes, farStars, midStars] as { x: number; y: number }[][]) {
      for (const p of arr) {
        p.x *= sx
        p.y *= sy
      }
    }
  }
  width = newWidth
  height = newHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const small = width < 640
  linkDist = small ? 100 : 130
  mouseDist = small ? 130 : 170
  const area = width * height
  syncCount(
    nodes,
    small ? clampCount(area / 30000, 16, 45) : clampCount(area / 22000, 30, 90),
    makeNode,
  )
  syncCount(
    farStars,
    small ? clampCount(area / 9000, 40, 130) : clampCount(area / 7000, 80, 260),
    () => makeStar('far'),
  )
  syncCount(
    midStars,
    small ? clampCount(area / 26000, 14, 46) : clampCount(area / 20000, 24, 90),
    () => makeStar('mid'),
  )
}

/** 绘制一层星野：漂移 + 闪烁 + 柔光，spike 星附加十字衍射光芒 */
const drawStarLayer = (
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  palette: string[],
  offX: number,
  offY: number,
  time: number,
) => {
  for (const s of stars) {
    s.x += s.vx
    s.y += s.vy
    if (s.x < -16) s.x = width + 16
    if (s.x > width + 16) s.x = -16
    if (s.y < -16) s.y = height + 16
    if (s.y > height + 16) s.y = -16

    const tw = 0.55 + 0.45 * Math.sin(time * s.twinkleSpeed + s.twinklePhase)
    const alpha = s.baseAlpha * tw
    const color = palette[s.colorIdx]
    const x = s.x + offX
    const y = s.y + offY

    // 较亮的星点带一圈柔光，避免扁平的"像素点"感
    if (s.r > 0.85) {
      ctx.fillStyle = `rgba(${color}, ${(alpha * 0.16).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(x, y, s.r * 3.2, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(x, y, s.r, 0, TAU)
    ctx.fill()

    if (s.spike) {
      const len = s.r * 7 * (0.7 + 0.3 * tw)
      ctx.strokeStyle = `rgba(${color}, ${(alpha * 0.35).toFixed(3)})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x - len, y)
      ctx.lineTo(x + len, y)
      ctx.moveTo(x, y - len)
      ctx.lineTo(x, y + len)
      ctx.stroke()
    }
  }
}

const spawnMeteor = (time: number) => {
  const dir = Math.random() < 0.5 ? 1 : -1
  const angle = (Math.PI / 180) * (18 + Math.random() * 22)
  const speed = 320 + Math.random() * 260
  meteors.push({
    x: width * 0.05 + Math.random() * width * 0.9,
    y: Math.random() * height * 0.35,
    vx: Math.cos(angle) * speed * dir,
    vy: Math.sin(angle) * speed,
    life: 0,
    maxLife: 0.8 + Math.random() * 0.6,
  })
  nextMeteorAt = time + 5 + Math.random() * 9
}

const step = (now = performance.now()) => {
  const canvas = canvasEl.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, width, height)

  const time = now / 1000
  const dt = lastTime > 0 ? Math.min((now - lastTime) / 1000, 0.05) : 0.016
  lastTime = now

  const dark = isDark()
  const dotAlpha = dark ? 0.65 : 0.5
  const lineBase = dark ? 0.22 : 0.15
  const dotColor = dark ? '165, 180, 252' : '99, 102, 241'
  const lineColor = dark ? '129, 140, 248' : '99, 102, 241'
  const meteorColor = dark ? '199, 210, 254' : '99, 102, 241'
  const starPalette = dark ? DARK_STAR_COLORS : LIGHT_STAR_COLORS

  const interactive = effects.mouseGlow && mouse.active

  // 视差随光标偏离屏幕中心反向轻移，lerp 平滑；无互动时缓慢回中
  const targetPx = interactive ? mouse.x / width - 0.5 : 0
  const targetPy = interactive ? mouse.y / height - 0.5 : 0
  parallax.x += (targetPx - parallax.x) * 0.04
  parallax.y += (targetPy - parallax.y) * 0.04

  if (effects.particles) {
    drawStarLayer(ctx, farStars, starPalette, parallax.x * -14, parallax.y * -14, time)
    drawStarLayer(ctx, midStars, starPalette, parallax.x * -30, parallax.y * -30, time)

    // 流星：随机间隔生成，头部亮点 + 渐隐尾迹，亮度按 sin 包络淡入淡出
    if (time >= nextMeteorAt && meteors.length < 2) spawnMeteor(time)
    if (meteors.length > 0) {
      ctx.lineCap = 'round'
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.life += dt
        if (m.life >= m.maxLife) {
          meteors.splice(i, 1)
          continue
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        const fade = Math.sin(Math.PI * (m.life / m.maxLife)) * (dark ? 1 : 0.6)
        const tailX = m.x - m.vx * 0.22
        const tailY = m.y - m.vy * 0.22
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
        grad.addColorStop(0, `rgba(${meteorColor}, ${(0.85 * fade).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${meteorColor}, 0)`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * fade).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(m.x, m.y, 1.1, 0, TAU)
        ctx.fill()
      }
      ctx.lineCap = 'butt'
    }

    // 近景星座层
    for (const n of nodes) {
      n.x += n.vx
      n.y += n.vy
      // 鼠标互动：靠近光标的粒子被轻微推开（按距离衰减）
      if (interactive) {
        const dx = n.x - mouse.x
        const dy = n.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist > 0.5 && dist < mouseDist) {
          const force = ((mouseDist - dist) / mouseDist) * 0.55
          n.x += (dx / dist) * force
          n.y += (dy / dist) * force
        }
      }
      if (n.x < -12) n.x = width + 12
      if (n.x > width + 12) n.x = -12
      if (n.y < -12) n.y = height + 12
      if (n.y > height + 12) n.y = -12
    }

    ctx.lineWidth = 1
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.hypot(dx, dy)
        if (dist >= linkDist) continue
        ctx.strokeStyle = `rgba(${lineColor}, ${((1 - dist / linkDist) * lineBase).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(nodes[i].x, nodes[i].y)
        ctx.lineTo(nodes[j].x, nodes[j].y)
        ctx.stroke()
      }
    }

    // 光标与附近粒子连线，形成"触达"效果
    if (interactive) {
      for (const n of nodes) {
        const dist = Math.hypot(n.x - mouse.x, n.y - mouse.y)
        if (dist >= mouseDist) continue
        ctx.strokeStyle = `rgba(${lineColor}, ${((1 - dist / mouseDist) * (lineBase * 2.2)).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(n.x, n.y)
        ctx.lineTo(mouse.x, mouse.y)
        ctx.stroke()
      }
    }

    // 节点带一圈柔光，读起来像近景亮星而非扁平圆点（两遍绘制减少样式切换）
    ctx.fillStyle = `rgba(${dotColor}, ${(dotAlpha * 0.14).toFixed(3)})`
    for (const n of nodes) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r * 2.8, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = `rgba(${dotColor}, ${dotAlpha})`
    for (const n of nodes) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, TAU)
      ctx.fill()
    }
  }

  // 光晕弹性跟随（lerp 产生非线性缓动轨迹）
  if (effects.mouseGlow && glowEl.value) {
    glowPos.x += (mouse.x - glowPos.x) * 0.08
    glowPos.y += (mouse.y - glowPos.y) * 0.08
    const half = glowEl.value.offsetWidth / 2
    glowEl.value.style.transform = `translate(${glowPos.x - half}px, ${glowPos.y - half}px)`
    glowEl.value.style.opacity = mouse.active ? '1' : '0'
  }

  raf = requestAnimationFrame(step)
}

const start = () => {
  if (running || reduceMotion) return
  running = true
  lastTime = 0
  nextMeteorAt = performance.now() / 1000 + 2 + Math.random() * 4
  raf = requestAnimationFrame(step)
}

const stop = () => {
  running = false
  cancelAnimationFrame(raf)
  meteors = []
  const ctx = canvasEl.value?.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, width, height)
  if (glowEl.value) glowEl.value.style.opacity = '0'
}

// pointer 事件同时覆盖鼠标与触屏：手指按下/拖动时粒子跟随互动
const onPointerMove = (ev: PointerEvent) => {
  mouse.x = ev.clientX
  mouse.y = ev.clientY
  if (!mouse.active) {
    mouse.active = true
    glowPos.x = mouse.x
    glowPos.y = mouse.y
  }
}

// 触屏抬手后没有"光标位置"，让光晕与连线淡出，避免停留在最后触点
const onPointerEnd = (ev: PointerEvent) => {
  if (ev.pointerType !== 'mouse') mouse.active = false
}

const onLeave = () => {
  mouse.active = false
}

const onVisibility = () => {
  if (document.hidden) {
    cancelAnimationFrame(raf)
  } else if (running) {
    lastTime = 0
    raf = requestAnimationFrame(step)
  }
}

// 任一效果开启就保持渲染循环；都关闭时停止并清空画布
watch(
  () => [effects.particles, effects.mouseGlow],
  ([particles, mouseGlow]) => {
    if (particles || mouseGlow) start()
    else stop()
  },
)

onMounted(() => {
  resize()
  // ResizeObserver 跟随 canvas 自身盒子变化（地址栏伸缩、横竖屏、键盘弹出
  // 都会触发），比 window resize 更可靠；不支持时回落到 window resize
  if (typeof ResizeObserver !== 'undefined' && canvasEl.value) {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvasEl.value)
  } else {
    window.addEventListener('resize', resize)
  }
  window.addEventListener('pointerdown', onPointerMove, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerEnd, { passive: true })
  window.addEventListener('pointercancel', onPointerEnd, { passive: true })
  document.documentElement.addEventListener('mouseleave', onLeave)
  document.addEventListener('visibilitychange', onVisibility)
  if (effects.particles || effects.mouseGlow) start()
})

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointerdown', onPointerMove)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerEnd)
  window.removeEventListener('pointercancel', onPointerEnd)
  document.documentElement.removeEventListener('mouseleave', onLeave)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <canvas ref="canvasEl" class="absolute inset-0 h-full w-full"></canvas>
    <div
      ref="glowEl"
      class="ambient-mouse-glow absolute left-0 top-0 h-[280px] w-[280px] opacity-0 sm:h-[440px] sm:w-[440px]"
    ></div>
  </div>
</template>
