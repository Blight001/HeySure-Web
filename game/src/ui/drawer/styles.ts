const STYLE_ID = 'gw-drawer-styles'

const DRAWER_CSS = `
  .gw-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 42vw; z-index: 200;
    background: rgba(28, 30, 38, 0.97); border-left: 2px solid #4a4f5e;
    color: #d6dae2; font: 13px/1.7 ui-monospace, "Cascadia Mono", Consolas, monospace;
    display: none; flex-direction: column; pointer-events: auto;
  }
  .gw-panel.open { display: flex; }
  .gw-panel .gp-rail {
    position: relative;
    flex: none; border-bottom: 1px solid #3a3f4c;
    display: flex; flex-direction: column; gap: 8px; padding: 10px 38px 8px 10px;
  }
  .gw-panel .gp-head {
    display: flex; flex-direction: row; align-items: center; gap: 10px; min-width: 0;
  }
  .gw-panel .gp-port-frame {
    width: 56px; height: 56px; box-sizing: border-box; flex: none;
    border: 2px solid #4a4f5e; border-radius: 4px;
    background: #20232b; display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .gw-panel .gp-port-frame canvas { image-rendering: pixelated; }
  .gw-panel .gp-port-meta { flex: 1; min-width: 0; }
  .gw-panel .gp-port-name { color: #f0c060; font-weight: bold; font-size: 14px; word-break: break-all; line-height: 1.2; }
  .gw-panel .gp-port-sub { color: #9fc6ff; font-size: 11px; line-height: 1.3; margin-top: 2px; }
  .gw-panel .gp-port-info {
    display: grid; grid-template-columns: 1fr 1fr; gap: 3px 14px;
    font-size: 12px; line-height: 1.4;
  }
  .gw-panel .gp-port-info:empty { display: none; }
  .gw-panel .gp-port-info .d-row { gap: 5px; min-width: 0; }
  .gw-panel .gp-port-info .d-row .k { min-width: 30px; }
  .gw-panel .gp-port-info .d-row .v { min-width: 0; word-break: break-all; }
  .gw-panel .gp-port-info .d-bar { grid-column: 1 / -1; margin: 1px 0 3px; height: 4px; }
  .gw-panel .gp-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .gw-panel .gp-tabs { display: flex; flex-direction: row; gap: 4px; flex-wrap: wrap; min-width: 0; }
  .gw-panel button.gp-tab {
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 3px;
    background: #2b2f3a; color: #9aa0b0; padding: 3px 9px; font: inherit; text-align: left; font-size: 12px;
  }
  .gw-panel button.gp-tab:hover { color: #d6dae2; }
  .gw-panel button.gp-tab.active { background: #343949; color: #f0c060; }
  .gw-panel .gp-close {
    position: absolute; top: 8px; right: 8px; z-index: 2;
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 3px;
    background: #282c36; color: #8a90a0; font: inherit; padding: 1px 6px; flex: none; margin-left: auto;
    font-size: 13px; line-height: 1;
  }
  .gw-panel .gp-close:hover { color: #d6dae2; }
  .gw-panel .gp-content { display: flex; flex: 1; min-height: 0; flex-direction: row; }
  .gw-panel .gp-body { padding: 10px 12px; overflow-y: auto; flex: 1; min-width: 0; }
  .gw-panel .gp-side {
    display: none; flex: 0 0 128px; min-width: 108px; max-width: 150px;
    border-left: 1px solid #3a3f4c; padding: 8px 10px; overflow-y: auto; font-size: 12px;
  }
  .gw-panel .gp-side.open { display: block; }
  .gw-panel .d-sec { margin-bottom: 12px; }
  .gw-panel .d-sec-title { color: #9fc6ff; margin-bottom: 3px; font-size: 12px; }
  .gw-panel .d-row { display: flex; gap: 6px; }
  .gw-panel .d-row .k { color: #8a90a0; flex: none; min-width: 32px; }
  .gw-panel .d-row .v { word-break: break-all; }
  .gw-panel .d-bar { height: 5px; background: #3a3f4c; border-radius: 3px; margin: 3px 0; overflow: hidden; }
  .gw-panel .d-bar > div { height: 100%; }
  .gw-panel button.d-btn {
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 3px;
    background: #343949; color: #d6dae2; font: inherit; padding: 3px 10px; margin: 1px 3px 1px 0; font-size: 12px;
  }
  .gw-panel button.d-btn:hover { background: #3f4558; }
  .gw-panel button.d-btn:disabled { opacity: 0.5; cursor: default; }
  .gw-panel button.d-btn.warn { border-color: #7a4a4a; color: #e0a0a0; }
  .gw-panel button.d-btn.ok { border-color: #4a7a55; color: #9fdcae; }
  .gw-panel select.d-sel, .gw-panel input.d-in, .gw-panel textarea.d-ta {
    width: 100%; box-sizing: border-box; background: #23262e; color: #d6dae2;
    border: 1px solid #4a4f5e; border-radius: 3px; font: inherit; padding: 2px 5px; margin: 1px 0;
  }
  .gw-panel textarea.d-ta { min-height: 52px; resize: vertical; }
  .gw-panel .d-err { color: #e08484; }
  .gw-panel .d-okmsg { color: #84d99a; }
  .gw-panel .d-item {
    border: 1px solid #3a3f4c; border-radius: 4px; padding: 5px 6px; margin-bottom: 5px;
  }
  .gw-panel .d-item.click { cursor: pointer; }
  .gw-panel .d-item.click:hover { border-color: #5a6175; }
  .gw-panel .d-dim { color: #8a90a0; }
  .gw-panel .d-pre {
    white-space: pre-wrap; word-break: break-word; max-height: 110px; overflow: auto;
    background: #20232b; border: 1px solid #343949; border-radius: 4px;
    padding: 5px 6px; margin-top: 3px; color: #cdd3dd;
  }
  .gw-panel .gp-side .d-talk { max-height: none; margin-bottom: 6px; }
  .gw-panel label.d-check {
    display: flex; align-items: flex-start; gap: 5px; cursor: pointer;
    border: 1px solid #343949; border-radius: 4px; padding: 3px 5px; margin: 3px 0;
  }
  .gw-panel label.d-check:hover { border-color: #5a6175; }
  .gw-panel label.d-check input { margin-top: 2px; accent-color: #f0c060; }
  .gw-panel .d-sub { color: #8a90a0; margin: 5px 0 1px; font-size: 11px; }
  .gw-panel .d-swatches { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
  .gw-panel button.d-swatch {
    cursor: pointer; width: 20px; height: 20px; padding: 0;
    border: 2px solid #4a4f5e; border-radius: 4px;
  }
  .gw-panel button.d-swatch.sel { border-color: #f0c060; }
  .gw-panel button.d-swatch.none {
    background: #23262e; color: #8a90a0; font: 10px/1 inherit; width: auto; padding: 0 5px; height: 20px;
  }
  .gw-panel input.d-color {
    width: 24px; height: 20px; padding: 0; border: 2px solid #4a4f5e; border-radius: 3px;
    background: #23262e; cursor: pointer;
  }
  .gw-panel input.d-color.sel { border-color: #f0c060; }
  .gw-panel input.d-range { width: 100%; accent-color: #f0c060; }
  .gw-panel .gp-cols { column-width: 260px; column-gap: 14px; }
  .gw-panel .gp-cols > .d-item { break-inside: avoid; }
`

export const installDrawerStyles = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = DRAWER_CSS
  document.head.appendChild(style)
}
