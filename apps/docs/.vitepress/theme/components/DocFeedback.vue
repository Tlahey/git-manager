<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, ref } from 'vue'

const ISSUE_TEMPLATE_URL = 'https://github.com/Tlahey/git-manager/issues/new'

const { title } = useData()

// Read at mount rather than derived from `relativePath`: this is the exact
// published URL (correct `SITE_BASE`/domain/trailing slash) with no need to
// reconstruct it, and this component only ever renders client-side content.
const pageUrl = ref('')
onMounted(() => {
  pageUrl.value = window.location.href
})

const feedbackUrl = computed(() => {
  const params = new URLSearchParams({
    template: 'doc-feedback.yml',
    title: `docs: ${title.value}`,
    page: pageUrl.value,
  })
  return `${ISSUE_TEMPLATE_URL}?${params.toString()}`
})
</script>

<template>
  <div class="doc-feedback">
    <p class="doc-feedback-text">Missing something on this page, or found it unclear?</p>
    <a :href="feedbackUrl" target="_blank" rel="noopener" class="doc-feedback-link">
      Report a documentation issue
    </a>
  </div>
</template>
