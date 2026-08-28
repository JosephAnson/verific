<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView } from 'vue-router'

const { locale } = useI18n({ useScope: 'global' })
</script>

<template>
  <header>
    <div class="wrapper">
      <nav class="flex container py-4 gap-4 font-bold items-center">
        <RouterLink to="/">
          Form 1
        </RouterLink>
        <RouterLink to="/form2">
          Form 2
        </RouterLink>
        <button type="button" @click="locale = locale === 'en' ? 'es' : 'en'">
          {{ locale === 'en' ? 'Español' : 'English' }}
        </button>
      </nav>
    </div>
  </header>

  <RouterView />
</template>
