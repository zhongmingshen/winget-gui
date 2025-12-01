<div align="right">[中文版说明](./README.md)</div>

# Winget GUI

Winget GUI is a Windows **winget** desktop client built with **Electron, Vue 3, Vite, TypeScript, and Ant Design Vue**. It offers a modern UI for browsing, upgrading, uninstalling applications, locating install directories, and cancelling ongoing operations while streaming the original `winget` output.

---

## 🔗 Quick Links

- [Chinese README](./README.md)
- [CHANGELOG](./CHANGELOG-20251201.md)
- [FAQ](#faq)

---

## ✨ Highlights

- **Bilingual interface** – switch between Chinese/English instantly and remember the preference
- **Progress tracking** – parse `winget` output to display progress and phases (downloading → installing → success/error/cancelled)
- **Cancellable upgrades** – SVG cancel button with confirmation dialog and detailed feedback
- **Install path resolver** – combine `winget show` and registry lookup to locate the install directory
- **Batch operations** – upgrade all outdated packages in one click with smart filtering
- **Robust error handling** – tolerate localized outputs, missing JSON support, and forced process termination

---

## 📁 Project Structure

```
wingetGUI/
├─ src/
│  ├─ main/              # Electron main process (Node)
│  │   ├─ main.ts
│  │   └─ preload.ts
│  └─ renderer/          # Vue 3 + Ant Design Vue frontend
│      ├─ App.vue
│      ├─ components/
│      └─ i18n.ts
├─ scripts/               # Build helper scripts
├─ CHANGELOG-*.md         # Release notes per iteration
├─ README.md              # Chinese documentation
├─ README.en.md           # English documentation (this file)
└─ package.json
```

---

## ⚙️ Requirements

| Component | Recommended Version                         |
| --------- | ------------------------------------------- |
| Windows   | 10 / 11                                     |
| Node.js   | ≥ 18.x                                      |
| pnpm      | ≥ 8.x (recommended)                         |
| winget    | ≥ 1.4 (preferably supports `--output json`) |

---

## 🚀 Setup & Development

```powershell
# Install dependencies
pnpm install

# Run Vite + Electron together
pnpm run dev

# Or run separately
pnpm run dev:vite
pnpm run dev:electron
```

Electron automatically loads the dev server. Use DevTools to inspect renderer logs when needed.

---

## 📦 Build & Distribution

```powershell
# Build the renderer (Vite)
pnpm run build

# Bundle main & preload
pnpm run build:main
pnpm run build:preload

# Produce distributable artifacts
pnpm run dist
```

Built installers live under `publish/`; plain app resources stay in `dist/`. Before publishing, update `CHANGELOG-YYYYMMDD.md` and both README files.

---

## 🧠 Main Process API (`window.api`)

Exposed via `src/main/preload.ts` and typed in `src/renderer/env.d.ts`.

| Method                       | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `listPackages()`             | Returns installed packages for the main table                     |
| `upgradePackage(id, token?)` | Upgrades a package; `token` is used for cancellation              |
| `upgradeAll()`               | Upgrades all packages with available updates                      |
| `uninstallPackage(id)`       | Uninstalls a package                                              |
| `getInstallPath(id, name?)`  | Attempts to resolve install location via `winget show` + registry |
| `openPath(path)`             | Opens File Explorer at the given directory                        |
| `cancelOperation(trackId)`   | Cancels an ongoing upgrade/installation task                      |
| `onWingetStream(cb)`         | Subscribes to streaming stdout/stderr from `winget`               |

Example:

```ts
const token = `${pkg.id}-${Date.now()}`;
const stopStream = window.api.onWingetStream((event) => {
  console.log(event.data);
});

try {
  await window.api.upgradePackage(pkg.id, token);
} catch (err) {
  if (String(err).includes("__CANCELLED__")) {
    // User cancelled the operation
  }
}

await window.api.cancelOperation(token);
stopStream();
```

---

## 🖥️ Renderer Highlights

- Progress phases: `preparing → downloading → installing → success/error/cancelled`
- Cancel logic: SVG icon + confirmation dialog, detailed failure hints when the process cannot be terminated
- Internationalization: all strings live in `src/renderer/i18n.ts`; add new languages by extending the messages object
- Listing features: keyword search, pagination, “only show updates” filter, open-install-folder action
- UX polish: menu bar removed in production builds for a cleaner native look

---

## FAQ

### Why does a package still show “update available” after cancelling?

Cancelling simply terminates the running `winget` command. The package list still indicates an available update until you run the upgrade successfully.

### Why is the progress bar stuck at “Installing…”?

Some installers stop printing output during installation. The UI stays in the installing state until `winget` reports success or failure. Use Task Manager to verify whether the installer is still running.

### What if the cancel command fails?

If `cancelOperation` returns `unable_to_terminate`, the installer may have already exited or switched to a GUI flow. You will need to close it manually or wait for completion.

---

## 🤝 Contribution Guide

1. Fork the repo and create a feature branch
2. After changes, run
   ```powershell
   pnpm run build
   pnpm run typecheck
   ```
3. Update `CHANGELOG-YYYYMMDD.md`, `README.md`, and `README.en.md`
4. Submit a PR describing the change scope and testing steps

---

## 📄 License

Source code is available under the MIT License (unless stated otherwise in the repository). `winget` functionality is provided by Windows Package Manager—please follow Microsoft’s terms of use.

---

<div align="center">
Docs: 👉 [中文版](./README.md) · [CHANGELOG](./CHANGELOG-20251201.md)
</div>
