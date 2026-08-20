# Device installation icons

These web thumbnails are resized copies of the application artwork owned by each device project:

- `windows.png`: `device/windows/src-tauri/icons/icon.png`
- `chrome.png`: `device/browser/browser_MCP/icons/icon128.png`
- `android.png`: `device/android/app/src/main/res/drawable/ic_launcher_logo.png`
- `ai-free.png`: `device/AI-FREE-app/native/chromium-fork/assets/AI-FREE.png`
- `linux.png`: the Linux Agent is now headless and has no current image asset. This uses its last official green tray artwork from `device/linux` commit `7b966a09b0235603dd8cc42ef4b5e1f37d9a20df` (`assets/desktop_green.png`, blob `7ab12363f3a64aa6cf0c7a68665167ae55676d33`). The same source file is retained in `device/windows/assets/desktop_green.png` and was used to create this thumbnail.

Keep these copies inside the web repository because production Web/Server deployments do not initialize the `device` submodule.
