<template>
    <div>
        <h3>{{ t('packageDetails.title') }}</h3>
        <div v-if="pkg">
            <p><strong>{{ t('packageDetails.name') }}:</strong> {{ pkg.name }}</p>
            <p><strong>{{ t('packageDetails.id') }}:</strong> {{ pkg.id }}</p>
            <p><strong>{{ t('packageDetails.version') }}:</strong> {{ pkg.version }}</p>
        </div>
        <div v-else>{{ t('packageDetails.empty') }}</div>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { useI18n } from 'vue-i18n'

export default defineComponent({
    name: 'PackageDetails',
    props: { pkg: { type: Object as PropType<any>, required: false } },
    setup() {
        const { t } = useI18n()
        return { t }
    }
})
</script>

<style scoped>
p {
    margin: 6px 0
}
</style>
