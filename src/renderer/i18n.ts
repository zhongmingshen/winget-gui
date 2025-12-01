import { createI18n } from "vue-i18n";

const STORAGE_KEY = "winget-gui-locale";
const FALLBACK_LOCALE = "en-US";

export const SUPPORTED_LOCALES = [
  { value: "zh-CN", labelKey: "language.zhCN" },
  { value: "en-US", labelKey: "language.enUS" },
] as const;

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["value"];

const supportedValues: SupportedLocale[] = SUPPORTED_LOCALES.map(
  (item) => item.value
) as SupportedLocale[];

function isSupportedLocale(value: string): value is SupportedLocale {
  return (supportedValues as string[]).includes(value);
}

function resolveDefaultLocale(): SupportedLocale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
      return stored;
    }
  }
  if (navigator?.language) {
    const matched = supportedValues.find((locale) =>
      navigator.language.startsWith(locale.substring(0, 2))
    );
    if (matched) return matched;
  }
  return "zh-CN";
}

const defaultLocale = resolveDefaultLocale();

function setDocumentLang(locale: string) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", locale);
  }
}

const messages = {
  "zh-CN": {
    language: {
      label: "语言",
      zhCN: "中文",
      enUS: "English",
    },
    menu: {
      manage: "软件管理",
    },
    app: {
      title: "软件管理面板",
    },
    packageList: {
      searchPlaceholder: "搜索名称或Id",
      filters: {
        onlyShowUpdates: "仅显示可更新",
      },
      actions: {
        refresh: "刷新软件列表",
        updateAll: "一键更新所有",
        update: "更新",
        uninstall: "卸载",
        details: "详情",
        cancel: "取消安装",
        confirmCancel: "确认取消",
        keepGoing: "继续等待",
      },
      columns: {
        name: "名称",
        id: "Id",
        version: "版本",
        available: "可用更新",
        actions: "操作",
      },
      modal: {
        title: "软件详情",
        installPathLabel: "安装目录",
        installPathPending: "未找到或正在解析",
        openDirectory: "打开目录",
      },
      progress: {
        preparing: "准备下载...",
        downloading: "下载中...",
        installing: "正在安装...",
        success: "更新完成",
        failed: "更新失败",
        cancelled: "更新已取消",
        working: "处理中...",
        percentSuffix: "（{percent}%）",
      },
      messages: {
        apiNotReady: "原生 API 未就绪；请重启或使用安装包。",
        apiNotReadyDetailed:
          "应用原生 API 未就绪；请尝试重启应用或使用安装包。",
        fetchFailed: "获取软件列表失败：{error}",
        refreshFailed: "刷新失败：{error}",
        updateSuccess: "{name} 更新完成",
        updateFailed: "更新失败：{error}",
        openPathEmpty: "路径为空",
        openPathSuccess: "已打开目录",
        openPathFailed: "无法打开目录: {error}",
        openPathError: "打开目录失败：{error}",
        noUpdates: "暂无可更新的软件",
        updateAllSuccess: "全部更新完成",
        updateAllPartial: "部分软件更新失败：{names}",
        updateAllFailed: "一键更新失败：{error}",
        updateAllCancelled: "已取消 {name} 的更新，后续任务已停止。",
        uninstallConfirmTitle: "确认卸载",
        uninstallConfirmContent: "确定要卸载 {name} 吗？",
        uninstallSuccess: "{name} 已卸载",
        uninstallFailed: "卸载失败：{error}",
        invalidPackageId: "无效的 package id",
        cancelled: "更新已手动取消",
        cancelConfirmTitle: "确认取消安装",
        cancelConfirmContent:
          "强制终止可能导致软件处于未知状态，确定要取消当前更新吗？",
        cancelIssued: "正在尝试取消安装...",
        cancelFailed: "取消失败：{error}",
        cancelFailedUnknown: "未知错误",
        cancelFailedCannotTerminate: "无法终止安装进程，可能已经完成。",
        cancelNotRunning: "当前没有正在执行的安装任务。",
      },
    },
    packageDetails: {
      title: "软件详情",
      name: "名称",
      id: "Id",
      version: "版本",
      empty: "请选择一个软件查看详情",
    },
  },
  "en-US": {
    language: {
      label: "Language",
      zhCN: "Chinese",
      enUS: "English",
    },
    menu: {
      manage: "Software Management",
    },
    app: {
      title: "Software Management Panel",
    },
    packageList: {
      searchPlaceholder: "Search by name or Id",
      filters: {
        onlyShowUpdates: "Only show updates",
      },
      actions: {
        refresh: "Refresh Packages",
        updateAll: "Update All",
        update: "Update",
        uninstall: "Uninstall",
        details: "Details",
        cancel: "Cancel Installation",
        confirmCancel: "Stop Update",
        keepGoing: "Keep Waiting",
      },
      columns: {
        name: "Name",
        id: "Id",
        version: "Version",
        available: "Available",
        actions: "Actions",
      },
      modal: {
        title: "Package Details",
        installPathLabel: "Install Path",
        installPathPending: "Not found or resolving",
        openDirectory: "Open Directory",
      },
      progress: {
        preparing: "Preparing download...",
        downloading: "Downloading...",
        installing: "Installing...",
        success: "Update complete",
        failed: "Update failed",
        cancelled: "Update cancelled",
        working: "Processing...",
        percentSuffix: " ({percent}%)",
      },
      messages: {
        apiNotReady:
          "Native API is not ready; please restart or use the installer.",
        apiNotReadyDetailed:
          "Native APIs are unavailable; please restart the app or use the installer build.",
        fetchFailed: "Failed to load package list: {error}",
        refreshFailed: "Refresh failed: {error}",
        updateSuccess: "{name} updated successfully",
        updateFailed: "Update failed: {error}",
        openPathEmpty: "Path is empty",
        openPathSuccess: "Directory opened",
        openPathFailed: "Unable to open directory: {error}",
        openPathError: "Failed to open directory: {error}",
        noUpdates: "No packages require updates",
        updateAllSuccess: "All packages updated successfully",
        updateAllPartial: "Some packages failed to update: {names}",
        updateAllFailed: "Update all failed: {error}",
        updateAllCancelled:
          "Cancelled update for {name}; remaining tasks stopped.",
        uninstallConfirmTitle: "Confirm Uninstall",
        uninstallConfirmContent: "Are you sure you want to uninstall {name}?",
        uninstallSuccess: "{name} has been uninstalled",
        uninstallFailed: "Uninstall failed: {error}",
        invalidPackageId: "Invalid package identifier",
        cancelled: "Update has been cancelled",
        cancelConfirmTitle: "Cancel Installation",
        cancelConfirmContent:
          "Force-stopping may leave the software in an unknown state. Do you still want to cancel the current update?",
        cancelIssued: "Attempting to cancel installation...",
        cancelFailed: "Cancel failed: {error}",
        cancelFailedUnknown: "Unknown error",
        cancelFailedCannotTerminate:
          "Unable to terminate the installer; it may have already finished.",
        cancelNotRunning: "No installation is currently running.",
      },
    },
    packageDetails: {
      title: "Package Details",
      name: "Name",
      id: "Id",
      version: "Version",
      empty: "Select a package to view details",
    },
  },
};

const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: FALLBACK_LOCALE,
  messages,
});

setDocumentLang(defaultLocale);

export function changeLocale(locale: string) {
  const target = isSupportedLocale(locale) ? locale : FALLBACK_LOCALE;
  if (i18n.global.locale.value !== target) {
    i18n.global.locale.value = target;
  }
  setDocumentLang(target);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, target);
  }
}

export default i18n;
