const STYLE_ID = 'gw-drawer-styles'

const DRAWER_CSS = `
  .gw-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 46vw; z-index: 200;
    background: linear-gradient(180deg, rgba(30, 32, 42, 0.97), rgba(24, 26, 34, 0.97));
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border-left: 1px solid #4a4f5e;
    box-shadow: -14px 0 34px rgba(0, 0, 0, 0.45);
    color: #d6dae2; font: 13px/1.7 ui-monospace, "Cascadia Mono", Consolas, monospace;
    display: flex; flex-direction: column; pointer-events: auto;
    transform: translateX(102%); visibility: hidden;
    transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.25, 1), visibility 0.22s;
  }
  .gw-panel.open { transform: none; visibility: visible; }
  .gw-panel .gp-rail {
    position: relative;
    flex: none; border-bottom: 1px solid #3a3f4c; background: rgba(255, 255, 255, 0.02);
    display: flex; flex-direction: column; gap: 10px; padding: 12px 42px 0 12px;
  }
  .gw-panel .gp-head {
    display: flex; flex-direction: row; align-items: center; gap: 10px; min-width: 0;
  }
  .gw-panel .gp-port-frame {
    width: 56px; height: 56px; box-sizing: border-box; flex: none;
    border: 2px solid #4a4f5e; border-radius: 6px;
    background: #20232b; box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.4);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
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
  .gw-panel .gp-actions { display: flex; flex-direction: column; gap: 2px; }
  .gw-panel .gp-actions:empty { display: none; }
  .gw-panel .gp-actions .d-btnrow { margin-top: 0; }
  .gw-panel .gp-actions .d-btn { flex: 1; }
  .gw-panel .gp-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .gw-panel .gp-tabs { display: flex; flex-direction: row; gap: 2px; flex-wrap: wrap; min-width: 0; margin-bottom: -1px; }
  .gw-panel button.gp-tab {
    cursor: pointer; border: none; border-bottom: 2px solid transparent;
    background: transparent; color: #9aa0b0; padding: 6px 11px 7px; font: inherit; font-size: 12px;
    border-radius: 5px 5px 0 0;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .gw-panel button.gp-tab:hover { color: #d6dae2; background: rgba(255, 255, 255, 0.05); }
  .gw-panel button.gp-tab.active {
    color: #f0c060; border-bottom-color: #f0c060; background: rgba(240, 192, 96, 0.08);
  }
  .gw-panel button.gp-tab:focus-visible { outline: 1px solid #f0c060; outline-offset: -1px; }
  .gw-panel .gp-close {
    position: absolute; top: 10px; right: 10px; z-index: 2;
    width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 5px;
    background: #282c36; color: #8a90a0; font: inherit; padding: 0; flex: none;
    font-size: 13px; line-height: 1;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .gw-panel .gp-close:hover { color: #ffb0a0; border-color: #7a4a4a; background: #332a2e; }
  .gw-panel .gp-content { display: flex; flex: 1; min-height: 0; flex-direction: row; }
  .gw-panel .gp-body {
    padding: 12px 14px; overflow-y: auto; flex: 1; min-width: 0;
    scrollbar-width: thin; scrollbar-color: #3a3f4c transparent;
  }
  .gw-panel .gp-side {
    display: none; flex: 0 0 128px; min-width: 108px; max-width: 150px;
    border-left: 1px solid #3a3f4c; padding: 10px; overflow-y: auto; font-size: 12px;
    scrollbar-width: thin; scrollbar-color: #3a3f4c transparent;
  }
  .gw-panel .gp-side.open { display: block; }
  .gw-panel ::-webkit-scrollbar { width: 8px; height: 8px; }
  .gw-panel ::-webkit-scrollbar-track { background: transparent; }
  .gw-panel ::-webkit-scrollbar-thumb { background: #3a3f4c; border-radius: 4px; }
  .gw-panel ::-webkit-scrollbar-thumb:hover { background: #4a4f5e; }
  .gw-panel .d-sec { margin-bottom: 16px; }
  .gw-panel .d-sec-title {
    color: #9fc6ff; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.06em;
    display: flex; align-items: center; gap: 8px;
  }
  .gw-panel .d-sec-title::after {
    content: ''; flex: 1; height: 1px;
    background: linear-gradient(90deg, #3a3f4c, transparent);
  }
  .gw-panel .d-row { display: flex; gap: 6px; }
  .gw-panel .d-row .k { color: #8a90a0; flex: none; min-width: 32px; }
  .gw-panel .d-row .v { word-break: break-all; }
  .gw-panel .d-bar { height: 5px; background: #3a3f4c; border-radius: 3px; margin: 3px 0; overflow: hidden; }
  .gw-panel .d-bar > div { height: 100%; transition: width 0.3s ease; }
  .gw-panel button.d-btn {
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 4px;
    background: #343949; color: #d6dae2; font: inherit; padding: 5px 12px; margin: 2px 6px 2px 0; font-size: 12px;
    transition: background 0.15s, border-color 0.15s, transform 0.05s;
  }
  .gw-panel button.d-btn:hover:not(:disabled) { background: #3f4558; border-color: #5a6175; }
  .gw-panel button.d-btn:active:not(:disabled) { transform: translateY(1px); }
  .gw-panel button.d-btn:focus-visible { outline: 1px solid #f0c060; outline-offset: 1px; }
  .gw-panel button.d-btn:disabled { opacity: 0.5; cursor: default; }
  .gw-panel button.d-btn.warn { border-color: #7a4a4a; color: #e0a0a0; }
  .gw-panel button.d-btn.warn:hover:not(:disabled) { background: #3d3038; border-color: #9a5a5a; }
  .gw-panel button.d-btn.ok { border-color: #4a7a55; color: #9fdcae; }
  .gw-panel button.d-btn.ok:hover:not(:disabled) { background: #2e3d34; border-color: #5a9a6a; }
  .gw-panel .d-btnrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  .gw-panel .d-btnrow .d-btn { margin: 0; }
  .gw-panel .d-btnrow .d-btn.push { margin-left: auto; }
  .gw-panel .d-btnrow .d-btn.grow { flex: 1; }
  .gw-panel .d-formrow { display: flex; gap: 6px; align-items: stretch; margin: 3px 0; }
  .gw-panel .d-formrow select.d-sel, .gw-panel .d-formrow input.d-in { flex: 1; margin: 0; min-width: 0; }
  .gw-panel .d-formrow .d-btn { margin: 0; flex: none; }
  .gw-panel select.d-sel, .gw-panel input.d-in, .gw-panel textarea.d-ta {
    width: 100%; box-sizing: border-box; background: #23262e; color: #d6dae2;
    border: 1px solid #4a4f5e; border-radius: 4px; font: inherit; padding: 5px 8px; margin: 3px 0;
    transition: border-color 0.15s;
  }
  .gw-panel select.d-sel:focus, .gw-panel input.d-in:focus, .gw-panel textarea.d-ta:focus {
    outline: none; border-color: #f0c060;
  }
  .gw-panel input.d-in::placeholder, .gw-panel textarea.d-ta::placeholder { color: #6a7080; }
  .gw-panel textarea.d-ta { min-height: 64px; resize: vertical; }
  .gw-panel .d-err:not(:empty) {
    color: #e08484; background: rgba(224, 132, 132, 0.08);
    border: 1px solid rgba(224, 132, 132, 0.3); border-radius: 4px;
    padding: 4px 8px; margin: 6px 0;
  }
  .gw-panel .d-okmsg:not(:empty) {
    color: #84d99a; background: rgba(132, 217, 154, 0.08);
    border: 1px solid rgba(132, 217, 154, 0.3); border-radius: 4px;
    padding: 4px 8px; margin: 6px 0;
  }
  .gw-panel .d-item {
    border: 1px solid #3a3f4c; border-radius: 5px; padding: 6px 8px; margin-bottom: 6px;
    background: rgba(255, 255, 255, 0.02);
    transition: border-color 0.15s, background 0.15s;
  }
  .gw-panel .d-item.click { cursor: pointer; }
  .gw-panel .d-item.click:hover { border-color: #5a6175; background: rgba(255, 255, 255, 0.05); }
  .gw-panel .d-item.d-flex { display: flex; align-items: center; gap: 8px; }
  .gw-panel .d-item.d-flex > span { flex: 1; min-width: 0; word-break: break-all; }
  .gw-panel .d-item.d-flex > .d-btn { flex: none; margin: 0; }
  .gw-panel .d-dim { color: #8a90a0; }
  .gw-panel .d-pre {
    white-space: pre-wrap; word-break: break-word; max-height: 110px; overflow: auto;
    background: #20232b; border: 1px solid #343949; border-radius: 4px;
    padding: 5px 6px; margin-top: 3px; color: #cdd3dd;
    scrollbar-width: thin; scrollbar-color: #3a3f4c transparent;
  }
  .gw-panel .gp-side .d-talk { max-height: none; margin-bottom: 6px; }
  .gw-panel label.d-check {
    display: flex; align-items: flex-start; gap: 6px; cursor: pointer;
    border: 1px solid #343949; border-radius: 4px; padding: 4px 6px; margin: 3px 0;
    transition: border-color 0.15s, background 0.15s;
  }
  .gw-panel label.d-check:hover { border-color: #5a6175; background: rgba(255, 255, 255, 0.04); }
  .gw-panel label.d-check input { margin-top: 2px; accent-color: #f0c060; }
  .gw-panel .d-sub { color: #8a90a0; margin: 7px 0 3px; font-size: 11px; }
  .gw-panel .d-swatches { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .gw-panel button.d-swatch {
    cursor: pointer; width: 22px; height: 22px; padding: 0;
    border: 2px solid #4a4f5e; border-radius: 5px;
    transition: transform 0.1s, border-color 0.15s, box-shadow 0.15s;
  }
  .gw-panel button.d-swatch:hover { transform: scale(1.12); }
  .gw-panel button.d-swatch.sel { border-color: #f0c060; box-shadow: 0 0 6px rgba(240, 192, 96, 0.5); }
  .gw-panel button.d-swatch.none {
    background: #23262e; color: #8a90a0; font: 10px/1 inherit; width: auto; padding: 0 6px; height: 22px;
  }
  .gw-panel input.d-color {
    width: 26px; height: 22px; padding: 0; border: 2px solid #4a4f5e; border-radius: 4px;
    background: #23262e; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .gw-panel input.d-color.sel { border-color: #f0c060; box-shadow: 0 0 6px rgba(240, 192, 96, 0.5); }
  .gw-panel input.d-range { width: 100%; accent-color: #f0c060; }
  .gw-panel .gp-cols { column-width: 260px; column-gap: 14px; }
  .gw-panel .gp-cols > .d-item { break-inside: avoid; }
  .gw-panel .d-screen {
    position: relative; width: 100%; aspect-ratio: 16 / 9;
    background: #000; border: 1px solid #343949; border-radius: 4px; overflow: hidden;
  }
  .gw-panel .d-screen.portrait { aspect-ratio: 9 / 19.5; max-height: 60vh; margin: 0 auto; }
  .gw-panel .d-screen-video {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain; background: #000;
  }
  .gw-panel .d-screen-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    text-align: center; padding: 0 12px; color: #9aa0b0; font-size: 12px;
    background: rgba(0, 0, 0, 0.4);
  }
  .gw-panel .d-screen-overlay.err { color: #e08484; }
  @media (prefers-reduced-motion: reduce) {
    .gw-panel, .gw-panel * { transition: none !important; }
  }
`

export const installDrawerStyles = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = DRAWER_CSS
  document.head.appendChild(style)
}
