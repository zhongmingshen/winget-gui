<div align="right">[English README](./README.en.md)</div>

# Winget GUI

Winget GUI 是一个基于 **Electron + Vue 3 + Vite + TypeScript + Ant Design Vue** 的 Windows `winget` 图形化管理工具，提供软件查询、升级、卸载、查看安装目录、取消安装等能力，并实时展示 `winget` 命令输出。

---

## 🔗 快速索引

- [English README](./README.en.md)
- [更新日志](./CHANGELOG-20251201.md)
- [常见问题](#常见问题-faq)

---

## ✨ 功能特性

- **中英双语界面**：右上角可实时切换界面语言，并记住偏好
- **实时进度条**：解析 `winget` 输出的百分比，区分「下载 → 安装 → 完成/失败/已取消」
- **取消安装**：提供 SVG 取消按钮、风险确认弹窗，支持终止下载或安装进程
- **安装目录定位**：结合 `winget show` 与注册表查找安装路径，可直接打开资源管理器
- **批量操作**：一键升级全部可更新软件，支持显示/筛选仅需更新的条目
- **容错优化**：处理 `winget` 多语言输出、JSON 不可用时的文本解析、强制终止等场景

---

## 📁 目录结构

```
wingetGUI/
├─ src/
│  ├─ main/              # Electron 主进程（Node 环境）
│  │   ├─ main.ts
│  │   └─ preload.ts
│  └─ renderer/          # Vue 3 + Ant Design Vue 前端
│      ├─ App.vue
│      ├─ components/
│      └─ i18n.ts
├─ scripts/               # 构建辅助脚本
├─ CHANGELOG-*.md         # 每次开发的更新记录
├─ README.md              # 中文文档（当前）
├─ README.en.md           # 英文文档
└─ package.json
```
