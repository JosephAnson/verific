<template>
  <nav class="bg-gray-800 text-white p-4">
    <div class="container mx-auto flex items-center justify-between">
      <div class="text-xl font-bold">
        Verific Demo
      </div>
      <ul class="flex space-x-6">
        <li>
          <NuxtLink to="/" class="hover:text-gray-300" active-class="text-blue-400">
            Zod Example
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/valibot" class="hover:text-gray-300" active-class="text-blue-400">
            Valibot Example
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/standard-schema" class="hover:text-gray-300" active-class="text-blue-400">
            Standard Schema
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
