/**
 * 游戏世界启动入口。
 *
 * 默认启动 Phaser 世界场景（P0 观察者）；`?preview=1` 进入资产预览页（调试工具）。
 * 同源 iframe 方案：直接复用主控制台的 localStorage token 与 /api、/socket.io。
 */

const boot = async () => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('preview') === '1') {
    document.body.classList.add('preview-mode')
    await import('./preview')
    return
  }

  document.body.classList.add('world-mode')
  const [{ default: Phaser }, { WorldScene }, { WorldStore }, { Overlay }] = await Promise.all([
    import('phaser'),
    import('./scenes/WorldScene'),
    import('./world/store'),
    import('./ui/overlay'),
  ])

  const store = new WorldStore()
  const overlay = new Overlay(document.body)
  // 调试/测试句柄：控制台可注入世界事件（store.dispatchEvent({...})）
  ;(window as unknown as Record<string, unknown>).__worldStore = store

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#3c5a40',
    pixelArt: true,
    // 必须关闭：Phaser 默认把 mousedown/mouseup（触屏同理）额外挂到
    // window.top 上。本页面是同源 iframe，window.top 就是主控制台——
    // 父页面任意位置（含弹窗）的点击都会被按"整个父窗口 → 画布"的错位
    // 坐标转发进世界，误触成员/建筑。关闭后只处理画布自身的指针事件。
    input: { windowEvents: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [],
  })
  game.scene.add('world', WorldScene, true, { store, overlay })
  // 调试/测试句柄：冒烟脚本断言相机状态
  ;(window as unknown as Record<string, unknown>).__worldGame = game

  // iframe 不可见时暂停渲染循环，避免后台烧 CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.loop.sleep()
    else game.loop.wake()
  })

  document.getElementById('loading')?.remove()
}

void boot()
