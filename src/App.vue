<script setup lang="ts">
import { ref } from 'vue'
import EncodePanel from './components/EncodePanel.vue'
import DecodePanel from './components/DecodePanel.vue'

const activeTab = ref<'encode' | 'decode'>('encode')
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-4 py-6">
        <h1 class="text-2xl font-bold text-gray-900">QR Code Backup</h1>
        <p class="mt-1 text-sm text-gray-500">
          Encode any file into printable QR codes, or decode them back.
        </p>
      </div>
    </header>

    <!-- Tab navigation -->
    <div class="max-w-4xl mx-auto px-4 pt-6">
      <div class="flex gap-1 bg-gray-200 rounded-lg p-1 w-fit">
        <button
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'encode'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900',
          ]"
          @click="activeTab = 'encode'"
        >
          Encode
        </button>
        <button
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'decode'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900',
          ]"
          @click="activeTab = 'decode'"
        >
          Decode
        </button>
      </div>
    </div>

    <!-- Content -->
    <main class="max-w-4xl mx-auto px-4 py-6">
      <EncodePanel v-if="activeTab === 'encode'" />
      <DecodePanel v-else />
    </main>

    <!-- Footer -->
    <footer class="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
      All processing happens client-side. No data leaves your browser.
    </footer>
  </div>
</template>
