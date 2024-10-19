<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header>
    <div class="wrapper">
      <nav class="flex container py-4 gap-4 font-bold">
        <RouterLink to="/">
          Form 1
        </RouterLink>
        <RouterLink to="/form2">
          Form 2
        </RouterLink>
      </nav>
    </div>
  </header>

  <RouterView />
</template>
