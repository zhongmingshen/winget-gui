<template>
    <a-config-provider :locale="antdLocale">
        <a-layout class="app-layout">
            <a-layout-sider width="240" class="sider">
                <div class="logo">winget GUI</div>
                <a-menu theme="dark" mode="inline" :selectedKeys="['manage']">
                    <a-menu-item key="manage">{{ t('menu.manage') }}</a-menu-item>
                </a-menu>
            </a-layout-sider>
            <a-layout>
                <a-layout-header class="header">
                    <span class="header-title">{{ t('app.title') }}</span>
                    <div class="header-actions">
                        <span class="header-lang-label">{{ t('language.label') }}</span>
                        <a-select v-model:value="currentLocale" size="small" style="width: 140px">
                            <a-select-option v-for="option in localeOptions" :key="option.value" :value="option.value">
                                {{ t(option.labelKey) }}
                            </a-select-option>
                        </a-select>
                    </div>
                </a-layout-header>
                <a-layout-content class="content">
                    <package-list />
                </a-layout-content>
            </a-layout>
        </a-layout>
    </a-config-provider>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import PackageList from './components/PackageList.vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import enUS from 'ant-design-vue/es/locale/en_US'
import { SUPPORTED_LOCALES, changeLocale } from './i18n'

export default defineComponent({
    name: 'App',
    components: { PackageList },
    setup() {
        const { t, locale } = useI18n()
        const localeOptions = SUPPORTED_LOCALES
        const currentLocale = computed({
            get: () => locale.value,
            set: (val: string) => changeLocale(val)
        })
        const antdLocale = computed(() => currentLocale.value === 'zh-CN' ? zhCN : enUS)

        return { t, localeOptions, currentLocale, antdLocale }
    }
})
</script>

<style scoped>
.app-layout {
    height: 100vh
}

.logo {
    color: #fff;
    font-weight: 700;
    font-size: 18px;
    padding: 16px;
    text-align: center
}

.header {
    background: #fff;
    padding: 12px 24px;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px
}

.header-title {
    font-weight: 600
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 8px
}

.header-lang-label {
    font-size: 14px;
    color: rgba(0, 0, 0, 0.65)
}

.content {
    padding: 24px;
    background: #f5f7fa;
    height: calc(100vh - 64px);
    overflow: hidden;
}

.sider {
    background: #001529
}
</style>
