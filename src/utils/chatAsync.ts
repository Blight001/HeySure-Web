export const waitMs = (ms: number) => new Promise<void>(resolve => {
  window.setTimeout(resolve, ms)
})
