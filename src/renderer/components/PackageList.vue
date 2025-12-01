<template>
    <div>
        <div class="toolbar" ref="toolbarRef">
            <a-input-search v-model:value="searchTerm" :placeholder="t('packageList.searchPlaceholder')"
                style="width: 300px" @search="onSearch" />
            <a-checkbox v-model:checked="onlyShowUpdates">{{ t('packageList.filters.onlyShowUpdates') }}</a-checkbox>
            <a-button type="primary" @click="refresh">{{ t('packageList.actions.refresh') }}</a-button>
            <a-button @click="upgradeAll" :loading="loading" :disabled="!hasUpdates">{{
                t('packageList.actions.updateAll') }}</a-button>
        </div>

        <a-spin :spinning="loading">
            <div class="table-wrap" ref="tableWrapRef" :style="{ '--table-min-width': tableMinWidth + 'px' }">
                <a-table :columns="columns" :data-source="pagedData" :pagination="false" rowKey="id" bordered
                    :scroll="{ y: tableHeight, x: tableMinWidth }" size="middle" :onRow="rowClickHandler">
                    <template #bodyCell="{ text, record, column }">
                        <template v-if="column && column.key === 'actions'">
                            <div v-if="progressMap[record.id]" class="actions-container progress-container">
                                <a-progress class="actions-progress" :percent="progressMap[record.id].percent"
                                    :status="progressMap[record.id].status" :show-info="false" stroke-width="6" />
                                <span class="progress-text">
                                    {{ t(progressMap[record.id].messageKey) }}
                                    <span class="progress-percent">{{ t('packageList.progress.percentSuffix', {
                                        percent:
                                            Math.round(progressMap[record.id].percent ?? 0)
                                    }) }}</span>
                                </span>
                                <button
                                    v-if="operationTokens[record.id] && progressMap[record.id].stage !== 'success' && progressMap[record.id].stage !== 'error'"
                                    class="progress-cancel-btn" :title="t('packageList.actions.cancel')"
                                    :aria-label="t('packageList.actions.cancel')" @click.stop="cancelUpgrade(record)">
                                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                                        focusable="false">
                                        <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="1.5"
                                            fill="none" />
                                        <path d="M8 8 L16 16 M16 8 L8 16" stroke="currentColor" stroke-width="1.5"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                            </div>
                            <div v-else class="actions-container">
                                <a-button v-if="isAvailableValid(record.available)" type="link"
                                    @click.stop="upgrade(record)" :loading="opLoading[record.id]">{{
                                        t('packageList.actions.update') }}</a-button>
                                <a-button type="link" danger @click.stop="confirmUninstall(record)">{{
                                    t('packageList.actions.uninstall') }}</a-button>
                                <a-button type="link" @click.stop="showDetails(record)">{{
                                    t('packageList.actions.details') }}</a-button>
                            </div>
                        </template>
                        <template v-else>
                            <span>{{ text }}</span>
                        </template>
                    </template>
                </a-table>
            </div>
        </a-spin>

        <div class="pager">
            <a-pagination :current="page" :page-size="pageSize" :total="filtered.length" @change="onPageChange"
                :show-size-changer="true" :page-size-options="[12, 24, 48]" />
        </div>

        <a-modal :title="t('packageList.modal.title')" v-model:visible="modalVisible" :width="600" :footer="null"
            @cancel="modalVisible = false">
            <package-details :pkg="selectedPkg" />
            <div style="margin-top:12px">
                <p style="margin:0"><strong>{{ t('packageList.modal.installPathLabel') }}:</strong>
                    <span v-if="selectedPkg && (selectedPkg as any).installPath">{{ (selectedPkg as any).installPath
                    }}</span>
                    <span v-else>{{ t('packageList.modal.installPathPending') }}</span>
                </p>
                <div style="margin-top:8px">
                    <a-button type="primary" v-if="selectedPkg && (selectedPkg as any).installPath"
                        :loading="selectedPkg && installPathLoading[selectedPkg.id]"
                        @click="() => { if (selectedPkg) openInstallPath((selectedPkg as any).installPath) }">{{
                            t('packageList.modal.openDirectory') }}</a-button>
                </div>
            </div>
        </a-modal>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, reactive, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PackageDetails from './PackageDetails.vue'
import { Modal, message } from 'ant-design-vue'

interface Pkg { name: string; id: string; version: string; available?: string }

type ProgressStage = 'preparing' | 'downloading' | 'installing' | 'success' | 'error'

interface ProgressState {
    percent: number
    status: 'active' | 'success' | 'exception'
    messageKey: string
    stage: ProgressStage
    updatedAt: number
}

export default defineComponent({
    name: 'PackageList',
    components: { PackageDetails },
    setup() {
        const { t, locale } = useI18n()
        const packages = ref<Pkg[]>([])
        const loading = ref(false)
        const opLoading = reactive({} as Record<string, boolean>)

        const searchTerm = ref('')
        const onlyShowUpdates = ref(false)
        const page = ref(1)
        const pageSize = ref(12)
        const modalVisible = ref(false)
        const selectedPkg = ref<Pkg | null>(null)
        const installPathLoading = reactive({} as Record<string, boolean>)
        const progressMap = reactive({} as Record<string, ProgressState>)
        const operationTokens = reactive({} as Record<string, string>)

        const columns = computed(() => [
            { title: t('packageList.columns.name'), dataIndex: 'name', key: 'name', width: 300, ellipsis: true },
            { title: t('packageList.columns.id'), dataIndex: 'id', key: 'id', width: 360, ellipsis: true },
            { title: t('packageList.columns.version'), dataIndex: 'version', key: 'version', width: 120, ellipsis: true },
            { title: t('packageList.columns.available'), dataIndex: 'available', key: 'available', width: 140, ellipsis: true },
            { title: t('packageList.columns.actions'), key: 'actions', width: 260, className: 'actions-column' }
        ])

        // 动态计算表格最小宽度（基于列宽）以实现自适应横向滚动
        const tableMinWidth = computed(() => {
            const cols = columns.value
            let sum = 0
            for (const c of cols) {
                const w = c && (c as any).width ? Number((c as any).width) : 150
                sum += isNaN(w) ? 150 : w
            }
            const min = Math.max(sum, 800)
            return min
        })

        const filtered = computed(() => {
            const term = searchTerm.value.trim().toLowerCase()
            let list = packages.value
            if (onlyShowUpdates.value) {
                list = list.filter(p => isAvailableValid(p.available))
            }
            if (!term) return list
            return list.filter(p => (p.name || '').toLowerCase().includes(term) || (p.id || '').toLowerCase().includes(term))
        })

        // `available` may be a source name (e.g. "winget") or a version string.
        // Treat it as an update only when it looks like a version (e.g. "1.2", "1.2.3", "25.01", "4.52.0").
        function isAvailableValid(val: any) {
            try {
                const s = String(val ?? '').trim()
                if (!s) return false
                // remove control chars and stray slashes/backslashes
                const cleaned = s.replace(/[\x00-\x1F\x7F\\\/|]+/g, '')
                if (!cleaned) return false
                // strict semantic-like version: 1.2 or 1.2.3 or 1.2.3-rc1
                const versionRegex = /^\d+(?:\.\d+)+(?:[-_\.\w]*)?$/
                // loose match: contains digit+dot (covers many simple cases)
                const loose = /\d+\.\d+/
                return versionRegex.test(cleaned) || loose.test(cleaned)
            } catch (e) {
                return false
            }
        }

        const hasUpdates = computed(() => {
            return packages.value.some(p => isAvailableValid(p.available))
        })

        const pagedData = computed(() => {
            const start = (page.value - 1) * pageSize.value
            return filtered.value.slice(start, start + pageSize.value)
        })

        function onPageChange(p: number, newPageSize?: number) {
            page.value = p
            if (newPageSize && newPageSize !== pageSize.value) {
                pageSize.value = newPageSize
                page.value = 1 // reset to first page when page size changes
            }
        }

        function onSearch() {
            page.value = 1
        }

        watch(onlyShowUpdates, () => {
            page.value = 1
        })

        function ensureProgressEntry(id: string, defaults?: { messageKey?: string; stage?: ProgressStage }) {
            if (!id) return
            const messageKey = defaults?.messageKey ?? 'packageList.progress.preparing'
            if (!progressMap[id]) {
                progressMap[id] = {
                    percent: 0,
                    status: 'active',
                    messageKey,
                    stage: defaults?.stage ?? 'preparing',
                    updatedAt: Date.now()
                }
            } else if (defaults?.messageKey) {
                progressMap[id].messageKey = defaults.messageKey
                progressMap[id].updatedAt = Date.now()
            }
            if (defaults?.stage) {
                progressMap[id].stage = defaults.stage
            }
        }

        function updateProgressValue(id: string, percent: number | null, messageKey?: string, stage?: ProgressStage) {
            if (!id) return
            ensureProgressEntry(id)
            const entry = progressMap[id]
            if (!entry) return
            if (typeof percent === 'number' && !Number.isNaN(percent)) {
                const clamped = Math.max(0, Math.min(100, percent))
                entry.percent = Math.max(entry.percent ?? 0, clamped)
            }
            if (messageKey) {
                entry.messageKey = messageKey
            }
            if (stage) {
                entry.stage = stage
            }
            entry.updatedAt = Date.now()
            if (stage && stage !== 'error' && entry.status === 'exception') {
                entry.status = 'active'
            }
        }

        function markProgressSuccess(id: string) {
            if (!id) return
            ensureProgressEntry(id)
            const entry = progressMap[id]
            if (!entry) return
            entry.percent = Math.max(entry.percent, 100)
            entry.status = 'success'
            entry.messageKey = 'packageList.progress.success'
            entry.stage = 'success'
            entry.updatedAt = Date.now()
        }

        function markProgressError(id: string) {
            if (!id) return
            ensureProgressEntry(id)
            const entry = progressMap[id]
            if (!entry) return
            entry.status = 'exception'
            entry.messageKey = 'packageList.progress.failed'
            entry.stage = 'error'
            entry.updatedAt = Date.now()
        }

        function scheduleProgressCleanup(id: string, delay?: number) {
            if (!id) return
            const entry = progressMap[id]
            if (!entry) return
            const plannedAt = entry.updatedAt
            const finalDelay = delay ?? (entry.status === 'exception' ? 5000 : 2500)
            window.setTimeout(() => {
                const current = progressMap[id]
                if (current && current.updatedAt === plannedAt) {
                    delete progressMap[id]
                }
            }, finalDelay)
        }

        function extractPercent(text: string): number | null {
            if (!text) return null
            const matches = text.match(/(\d{1,3})\s*%/g)
            if (!matches) return null
            for (let i = matches.length - 1; i >= 0; i--) {
                const numeric = parseInt(matches[i].replace(/\D+/g, ''), 10)
                if (!Number.isNaN(numeric) && numeric >= 0) {
                    return Math.min(100, numeric)
                }
            }
            return null
        }

        function handleUpgradeStream(event: any) {
            if (!event) return
            const payload = typeof event === 'string' ? { data: String(event), action: null, id: null } : event
            const chunk = typeof payload.data === 'string' ? payload.data : String(payload.data ?? '')
            if (!chunk) return
            const action = payload?.action || (payload?.context && (payload.context as any).action) || null
            const targetId = payload?.id || (payload?.context && (payload.context as any).id) || ''
            if (action !== 'upgrade' || !targetId) return
            ensureProgressEntry(targetId)
            const percent = extractPercent(chunk)
            if (percent !== null) {
                if (percent >= 100) {
                    updateProgressValue(targetId, percent, 'packageList.progress.installing', 'installing')
                } else {
                    updateProgressValue(targetId, percent, 'packageList.progress.downloading', 'downloading')
                }
            } else if (/(downloading|下载|progress)/i.test(chunk)) {
                updateProgressValue(targetId, null, 'packageList.progress.downloading', 'downloading')
            } else if (/(installing|正在安装|installation|install)/i.test(chunk)) {
                updateProgressValue(targetId, null, 'packageList.progress.installing', 'installing')
            }

            if (/(已成功|successfully|completed|安装完成|安装成功)/i.test(chunk)) {
                markProgressSuccess(targetId)
                scheduleProgressCleanup(targetId, 3000)
            } else if (/(失败|error|failed|unable)/i.test(chunk.toLowerCase())) {
                markProgressError(targetId)
                scheduleProgressCleanup(targetId, 6000)
            }
        }

        let removeStream: (() => void) | null = null

        async function refresh() {
            loading.value = true
            try {
                console.log('[DEV] refresh start')
                // runtime check
                // @ts-ignore
                if (!window.api || typeof window.api.listPackages !== 'function') {
                    message.error(t('packageList.messages.apiNotReady'))
                    packages.value = []
                    return
                }
                // @ts-ignore
                const res = await window.api.listPackages()
                // log raw response shape for debugging (trim large arrays)
                try {
                    const sampleRaw = Array.isArray(res) ? (res.slice ? res.slice(0, 6) : res) : res
                    console.log('[DEV] raw listPackages response sample', JSON.stringify({ type: typeof res, sample: sampleRaw }))
                } catch (e) { }
                if (res && res.error) {
                    message.error(t('packageList.messages.fetchFailed', { error: res.error }))
                    packages.value = []
                } else {
                    let list = Array.isArray(res) ? res : []
                    // 快速修复：用正则判断首条是否为解析垃圾（例如仅由 - \\ | / 等字符构成）
                    if (list.length > 0) {
                        try {
                            const first = list[0] as any
                            const name0 = String(first?.name ?? '').trim()
                            const id0 = String(first?.id ?? '').trim()
                            const ver0 = String(first?.version ?? '').trim()
                            const avail0 = String(first?.available ?? '').trim()
                            // 垃圾模式：仅包含空白、破折号、竖线、斜杠、反斜杠或控制字符
                            const junkRe = /^[\s\-\|\\\/\x00-\x1F\x7F]+$/
                            let junkCount = 0
                            if (!name0 || junkRe.test(name0)) junkCount++
                            if (!id0 || junkRe.test(id0)) junkCount++
                            if (!ver0 || junkRe.test(ver0)) junkCount++
                            if (!avail0 || junkRe.test(avail0)) junkCount++
                            // 若首条至少有两个字段看起来像垃圾，则移除首项
                            if (junkCount >= 2) {
                                const removed = list.shift()
                                console.log('[DEV] refresh removed first entry by regex', JSON.stringify({ name0, id0, ver0, avail0, removed }))
                            }
                        } catch (e) {
                            // ignore any unexpected structure
                        }
                    }

                    // defensive filter in renderer: drop rows with junk-only name or id
                    function isJunkField(v: any) {
                        try {
                            const s = String(v ?? '').trim()
                            if (!s) return true
                            // only punctuation/backslashes/dashes/control chars
                            if (/^[\-\|\\\/\s\x00-\x1F\x7F]+$/.test(s)) return true
                            // no letters/digits/CJK
                            if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(s)) return true
                            return false
                        } catch (e) {
                            return true
                        }
                    }

                    const before = list.length
                    list = list.filter(item => !isJunkField(item.name) && !isJunkField(item.id))
                    const removed = before - list.length
                    packages.value = list
                    console.log('[DEV] refresh loaded packages', JSON.stringify({ count: packages.value.length, removed, sample: packages.value.slice(0, 3) }))
                }
            } catch (err: any) {
                message.error(t('packageList.messages.refreshFailed', { error: String(err) }))
            } finally {
                loading.value = false
            }
        }

        function showDetails(rec: Pkg) {
            try {
                console.log('[DEV] showDetails called', JSON.stringify({ id: rec?.id, name: rec?.name }))
            } catch (e) { }
            selectedPkg.value = rec
            if (selectedPkg.value && (selectedPkg.value as any).installPath) {
                (selectedPkg.value as any).installPath = ''
            }
            modalVisible.value = true
            try { console.log('[DEV] modalVisible set true') } catch (e) { }
            // try to resolve install path (best-effort)
            try {
                const pkgId = rec?.id ? String(rec.id) : ''
                if (pkgId) {
                    installPathLoading[pkgId] = true
                    // @ts-ignore
                    window.api.getInstallPath(pkgId, rec?.name).then((p: any) => {
                        try {
                            if (!selectedPkg.value || String(selectedPkg.value.id) !== pkgId) {
                                return
                            }
                            const resolved = typeof p === 'string' && p.trim() ? p : ''
                            if (selectedPkg.value) {
                                (selectedPkg.value as any).installPath = resolved
                            }
                            console.log('[DEV] resolved installPath', p)
                        } catch (e) { }
                    }).catch((e: any) => {
                        console.log('[DEV] getInstallPath error', String(e))
                        if (selectedPkg.value && String(selectedPkg.value.id) === pkgId) {
                            (selectedPkg.value as any).installPath = ''
                        }
                    }).finally(() => {
                        installPathLoading[pkgId] = false
                    })
                }
            } catch (e) { }
        }

        // log modal open/close for debugging
        watch(modalVisible, (v) => {
            try {
                console.log('[DEV] modalVisible changed', v)
            } catch (e) { }
        })

        async function executeUpgrade(rec: Pkg, options: { silent?: boolean; refreshAfter?: boolean } = {}) {
            const { silent = false, refreshAfter = true } = options
            const pkgId = rec.id ? String(rec.id).trim() : ''
            if (!pkgId) throw new Error(t('packageList.messages.invalidPackageId'))
            opLoading[rec.id] = true
            const token = `${pkgId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            operationTokens[pkgId] = token
            ensureProgressEntry(pkgId, { messageKey: 'packageList.progress.preparing', stage: 'preparing' })
            updateProgressValue(pkgId, 0, 'packageList.progress.preparing', 'preparing')
            try {
                console.log('[DEV] upgrade request', JSON.stringify({ id: pkgId, name: rec.name }))
                // @ts-ignore
                const out = await window.api.upgradePackage(pkgId, token)
                console.log(JSON.stringify(out))
                markProgressSuccess(pkgId)
                if (refreshAfter) {
                    await refresh()
                }
                if (!silent) {
                    message.success(t('packageList.messages.updateSuccess', { name: rec.name }))
                }
                scheduleProgressCleanup(pkgId, 3000)
                return 'success'
            } catch (err: any) {
                const errorText = String(err ?? '')
                if (errorText.includes('__CANCELLED__')) {
                    updateProgressValue(pkgId, progressMap[pkgId]?.percent ?? 0, 'packageList.progress.cancelled', 'error')
                    if (progressMap[pkgId]) {
                        progressMap[pkgId].status = 'exception'
                    }
                    scheduleProgressCleanup(pkgId, 4000)
                    if (!silent) {
                        message.info(t('packageList.messages.cancelled'))
                    }
                    return 'cancelled'
                }
                markProgressError(pkgId)
                scheduleProgressCleanup(pkgId, 6000)
                throw err
            } finally {
                opLoading[rec.id] = false
                delete operationTokens[pkgId]
            }
        }

        async function upgrade(rec: Pkg) {
            try {
                const result = await executeUpgrade(rec)
                if (result === 'cancelled') {
                    return
                }
            } catch (err: any) {
                message.error(t('packageList.messages.updateFailed', { error: String(err) }))
            }
        }

        async function openInstallPath(p: string) {
            try {
                if (!p) return message.error(t('packageList.messages.openPathEmpty'))
                console.log('[DEV] openInstallPath', p)
                // @ts-ignore
                const out = await window.api.openPath(p)
                if (out && out.ok) {
                    message.success(t('packageList.messages.openPathSuccess'))
                } else {
                    const errMsg = out && out.error ? out.error : String(out)
                    message.error(t('packageList.messages.openPathFailed', { error: errMsg }))
                }
            } catch (e: any) {
                message.error(t('packageList.messages.openPathError', { error: String(e) }))
            }
        }

        async function upgradeAll() {
            const targets = packages.value.filter(p => isAvailableValid(p.available))
            if (targets.length === 0) {
                message.info(t('packageList.messages.noUpdates'))
                return
            }
            loading.value = true
            const failures: { pkg: Pkg; error: any }[] = []
            const cancelled: Pkg[] = []
            try {
                console.log('[DEV] upgradeAll request', JSON.stringify({ total: targets.length }))
                for (const item of targets) {
                    try {
                        const result = await executeUpgrade(item, { silent: true, refreshAfter: false })
                        if (result === 'cancelled') {
                            cancelled.push(item)
                            break
                        }
                    } catch (err: any) {
                        failures.push({ pkg: item, error: err })
                    }
                }
                await refresh()
                if (cancelled.length > 0) {
                    message.info(t('packageList.messages.updateAllCancelled', {
                        name: cancelled[0].name || cancelled[0].id
                    }))
                } else if (failures.length === 0) {
                    message.success(t('packageList.messages.updateAllSuccess'))
                } else {
                    const separator = locale.value.startsWith('zh') ? '、' : ', '
                    const names = failures.map(f => f.pkg.name || f.pkg.id).filter(Boolean).join(separator)
                    message.warning(t('packageList.messages.updateAllPartial', { names }))
                }
            } catch (err: any) {
                message.error(t('packageList.messages.updateAllFailed', { error: String(err) }))
            } finally {
                loading.value = false
            }
        }

        function cancelUpgrade(rec: Pkg) {
            const pkgId = rec.id ? String(rec.id).trim() : ''
            if (!pkgId) return
            const token = operationTokens[pkgId]
            if (!token) return
            Modal.confirm({
                title: t('packageList.messages.cancelConfirmTitle'),
                content: t('packageList.messages.cancelConfirmContent'),
                okText: t('packageList.actions.confirmCancel'),
                cancelText: t('packageList.actions.keepGoing'),
                okType: 'danger',
                async onOk() {
                    try {
                        const res = await window.api.cancelOperation(token)
                        if (res && res.ok) {
                            message.warning(t('packageList.messages.cancelIssued'))
                        } else {
                            const code = res && res.error ? String(res.error) : ''
                            const friendly = code === 'unable_to_terminate'
                                ? t('packageList.messages.cancelFailedCannotTerminate')
                                : code === 'not_running'
                                    ? t('packageList.messages.cancelNotRunning')
                                    : t('packageList.messages.cancelFailedUnknown')
                            message.error(t('packageList.messages.cancelFailed', { error: friendly }))
                        }
                    } catch (err: any) {
                        message.error(t('packageList.messages.cancelFailed', { error: String(err) }))
                    }
                }
            })
        }

        function confirmUninstall(rec: Pkg) {
            Modal.confirm({
                title: t('packageList.messages.uninstallConfirmTitle'),
                content: t('packageList.messages.uninstallConfirmContent', { name: rec.name }),
                onOk() {
                    return uninstall(rec)
                }
            })
        }

        async function uninstall(rec: Pkg) {
            const pkgId = rec.id ? String(rec.id).trim() : ''
            opLoading[rec.id] = true
            try {
                if (!pkgId) throw new Error(t('packageList.messages.invalidPackageId'))
                console.log('[DEV] uninstall request', JSON.stringify({ id: pkgId, name: rec.name }))
                // @ts-ignore
                const out = await window.api.uninstallPackage(pkgId)
                message.success(t('packageList.messages.uninstallSuccess', { name: rec.name }))
                console.log(JSON.stringify(out))
                refresh()
            } catch (err: any) {
                message.error(t('packageList.messages.uninstallFailed', { error: String(err) }))
            } finally {
                opLoading[rec.id] = false
            }
        }

        // layout refs and dynamic table height calculation
        const tableWrapRef = ref<HTMLElement | null>(null)
        const toolbarRef = ref<HTMLElement | null>(null)
        const tableHeight = ref<number>(400)

        // 同步表头与表体宽度，补偿纵向滚动条导致的错位
        function syncTableHeaderBody() {
            const wrap = tableWrapRef.value
            if (!wrap) return
            const headerWrap = wrap.querySelector('.ant-table-header') as HTMLElement | null
            const bodyWrap = wrap.querySelector('.ant-table-body') as HTMLElement | null
            const headerTable = headerWrap ? headerWrap.querySelector('table') as HTMLTableElement | null : null
            const bodyTable = bodyWrap ? bodyWrap.querySelector('table') as HTMLTableElement | null : null
            if (!bodyTable) return

            // 只设置 min-width，避免和 CSS 的 width:100% 冲突
            const desired = `${tableMinWidth.value}px`
            // removed verbose layout logs to reduce noise during debugging
            try {
                bodyTable.style.minWidth = desired
                if (headerTable) headerTable.style.minWidth = desired

                // 保持 header 与 body 对齐：当 body 出现垂直滚动条时，给 header 留出相同的右侧空间
                const scrollBarWidth = bodyWrap ? (bodyWrap.offsetWidth - bodyWrap.clientWidth) : 0
                if (headerWrap) headerWrap.style.paddingRight = scrollBarWidth > 0 ? `${scrollBarWidth}px` : '0px'
                // intentionally silent about scrollbar width
            } catch (e) {
                // ignore
            }
        }

        function computeTableHeight() {
            const toolbarHeight = toolbarRef.value ? toolbarRef.value.getBoundingClientRect().height : 0
            const pagerEl = document.querySelector('.pager') as HTMLElement | null
            const pagerHeight = pagerEl ? pagerEl.getBoundingClientRect().height : 0

            // Prefer to compute available height from the actual wrapper element so
            // Ant Table's internal body height (scroll.y) will fit inside the wrapper
            const wrap = tableWrapRef.value
            if (wrap) {
                const headerEl = wrap.querySelector('.ant-table-header') as HTMLElement | null
                const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0
                const available = Math.max(240, Math.floor(wrap.clientHeight - headerH))
                tableHeight.value = available
                // removed verbose layout logs to reduce noise during debugging
                return
            }
            // removed verbose layout logs to reduce noise during debugging
            // fallback: window-based calculation (legacy)
            const available = window.innerHeight - 64 - 48 - toolbarHeight - pagerHeight
            tableHeight.value = Math.max(240, Math.floor(available))
            // removed verbose layout logs to reduce noise during debugging
        }

        function getCellText(record: any, column: any) {
            if (!column) return ''
            const key = (column as any).dataIndex || (column as any).key
            if (!key) return ''
            try {
                const v = record[key]
                return v == null ? '' : String(v)
            } catch (e) {
                return ''
            }
        }

        // onRow handler for Ant Table: clicking any row will open details as a fallback
        function rowClickHandler(record: any) {
            return { onClick: () => showDetails(record) }
        }

        // subscribe to winget streaming output and compute sizes
        onMounted(() => {
            // runtime guard: ensure preload API is available
            if (!window.api || typeof window.api.listPackages !== 'function') {
                message.error(t('packageList.messages.apiNotReadyDetailed'))
                return
            }

            nextTick(() => computeTableHeight())
            window.addEventListener('resize', computeTableHeight)

            // 初始渲染后同步宽度
            nextTick(() => syncTableHeaderBody())

            console.log('[DEV] PackageList onMounted', JSON.stringify({ time: new Date().toISOString(), tableMinWidth: tableMinWidth.value, page: page.value, pageSize: pageSize.value }))

            watch([pagedData, () => tableMinWidth.value, page], () => {
                console.log('[DEV] watch triggered for pagedData/tableMinWidth/page', JSON.stringify({ page: page.value, pagedCount: pagedData.value.length, tableMinWidth: tableMinWidth.value }))
                nextTick(() => syncTableHeaderBody())
            })

            removeStream = window.api.onWingetStream((event) => {
                try {
                    handleUpgradeStream(event)
                } catch (err) {
                    console.error('[winget stream handler error]', err)
                }
            })
            refresh()
        })

        onUnmounted(() => {
            window.removeEventListener('resize', computeTableHeight)
            if (removeStream) {
                removeStream()
                removeStream = null
            }
        })

        return {
            packages,
            columns,
            refresh,
            upgrade,
            uninstall,
            upgradeAll,
            getCellText,
            loading,
            searchTerm,
            page,
            pageSize,
            pagedData,
            filtered,
            onPageChange,
            onSearch,
            showDetails,
            modalVisible,
            selectedPkg,
            confirmUninstall,
            opLoading,
            tableHeight,
            hasUpdates,
            tableMinWidth,
            tableWrapRef,
            rowClickHandler,
            isAvailableValid,
            installPathLoading,
            openInstallPath,
            onlyShowUpdates,
            progressMap,
            operationTokens,
            cancelUpgrade,
            t
        }
    }
})
</script>

<style scoped>
.toolbar {
    margin-bottom: 12px;
    display: flex;
    gap: 8px;
    align-items: center
}

.pager {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end
}

.table-wrap {
    height: calc(100vh - 220px);
    overflow-x: hidden;
    /* let Ant Table handle horizontal scrolling internally */
    /* let Ant Table handle vertical scrolling internally */
    overflow-y: hidden;
}

/* Ensure table cells ellipsis and prevent wrapping */
::v-deep .ant-table-cell {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Allow actions column to wrap and show multiple buttons */
::v-deep .ant-table-cell.actions-column {
    white-space: normal;
    overflow: visible;
}

.actions-container {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.actions-progress {
    width: 140px;
}

.progress-text {
    font-size: 12px;
    color: #1890ff;
    white-space: nowrap;
}

.progress-text .progress-percent {
    color: #595959;
}

.progress-container {
    flex-wrap: nowrap;
    gap: 12px;
    align-items: center;
}

.progress-cancel-btn {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    color: #ff4d4f;
    display: inline-flex;
    align-items: center;
}

.progress-cancel-btn:hover {
    color: #d9363e;
}

.progress-cancel-btn:focus {
    outline: none;
}

/* Slightly reduce global table font to fit more content */
.table-wrap ::v-deep .ant-table {
    font-size: 13px;
}

/* Consolidated table scrolling rules
   - use a min-width to trigger horizontal scroll when container is narrower
   - prefer width:100% so table aligns to container when possible
   - avoid forcing max-content which caused inconsistent scrollbars */
.table-wrap ::v-deep .ant-table-container {
    overflow: auto;
}

.table-wrap ::v-deep .ant-table {
    font-size: 13px;
}

.table-wrap ::v-deep .ant-table table {
    min-width: var(--table-min-width) !important;
    width: 100% !important;
    /* ensure table aligns to container while respecting min-width */
    table-layout: fixed !important;
}

.table-wrap ::v-deep .ant-table-body {
    overflow: auto;
    overflow-x: auto;
    /* ensure horizontal scrolling available inside table body */
}

.table-wrap ::v-deep .ant-table-header table {
    min-width: var(--table-min-width) !important;
    table-layout: fixed !important;
}

.table-wrap ::v-deep .ant-table-body-inner {
    min-width: var(--table-min-width);
}

/* Make table rows appear clickable for the details fallback */
::v-deep .ant-table-tbody>tr {
    cursor: pointer;
}
</style>
