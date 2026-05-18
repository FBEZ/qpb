<script setup lang="ts">
import { ref, computed } from 'vue'
import { runEncode } from '../lib/encode'
import { MAX_BYTES_PER_QR } from '../lib/constants'
import type { EncodeResult } from '../lib/types'

// State
const file = ref<File | null>(null)
const generatePdf = ref(true)
const highDensity = ref(false)
const customTitle = ref('')
const useCustomTitle = ref(false)
const description = ref('')
const encoding = ref(false)
const progress = ref({ current: 0, total: 0, message: '' })
const result = ref<EncodeResult | null>(null)
const error = ref<string | null>(null)

// Computed
const estimatedCodes = computed(() => {
  if (!file.value) return 0
  return Math.ceil(file.value.size / MAX_BYTES_PER_QR)
})

// File selection
function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    file.value = input.files[0]
    result.value = null
    error.value = null
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    file.value = event.dataTransfer.files[0]
    result.value = null
    error.value = null
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
}

// Encode
async function encode() {
  if (!file.value) return

  encoding.value = true
  error.value = null
  result.value = null

  try {
    const fileData = new Uint8Array(await file.value.arrayBuffer())
      const encodeResult = await runEncode(
        {
          fileData,
          fileName: file.value.name,
          a4: generatePdf.value,
          highDensity: highDensity.value,
          description: description.value,
        },
      (current, total, message) => {
        progress.value = { current, total, message: message || '' }
      },
    )
    result.value = encodeResult
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    encoding.value = false
  }
}

// Downloads
function downloadPdf() {
  if (!result.value?.pdfBlob) return
  const url = URL.createObjectURL(result.value.pdfBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'qrcode_total.pdf'
  a.click()
  URL.revokeObjectURL(url)
}

function downloadImage(index: number) {
  if (!result.value) return
  const a = document.createElement('a')
  a.href = result.value.qrDataUrls[index]
  a.download = `qrcode_${index + 1}.jpg`
  a.click()
}

function downloadAllImages() {
  if (!result.value) return
  for (let i = 0; i < result.value.qrDataUrls.length; i++) {
    setTimeout(() => downloadImage(i), i * 100)
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-6">
    <!-- File input -->
    <div
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
      @drop="onDrop"
      @dragover="onDragOver"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        @change="onFileSelect"
      />
      <div v-if="file" class="space-y-1">
        <p class="text-sm font-medium text-gray-900">{{ file.name }}</p>
        <p class="text-xs text-gray-500">
          {{ formatBytes(file.size) }} &middot;
          ~{{ estimatedCodes }} QR code{{ estimatedCodes !== 1 ? 's' : '' }}
        </p>
      </div>
      <div v-else class="space-y-1">
        <p class="text-sm text-gray-600">Drop a file here or click to select</p>
        <p class="text-xs text-gray-400">Any file type supported</p>
      </div>
    </div>

    <!-- Options -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 class="text-sm font-medium text-gray-700">Options</h3>

      <div class="space-y-3">
        <!-- A4 PDF -->
        <label class="flex items-center gap-2">
          <input
            v-model="generatePdf"
            type="checkbox"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-700">Generate A4 PDF</span>
        </label>

        <!-- High density (only when PDF is on) -->
        <label v-if="generatePdf" class="flex items-center gap-2 ml-6">
          <input
            v-model="highDensity"
            type="checkbox"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-700">High density (30/page instead of 20/page)</span>
        </label>

        <!-- Title -->
        <div v-if="generatePdf" class="ml-6 space-y-2">
          <label class="flex items-center gap-2">
            <input
              v-model="useCustomTitle"
              type="checkbox"
              class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">Custom title</span>
          </label>
          <input
            v-if="useCustomTitle"
            v-model="customTitle"
            type="text"
            placeholder="Leave empty to hide title"
            class="ml-6 block w-64 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <!-- Description -->
        <div v-if="generatePdf" class="ml-6 mt-2 space-y-2">
          <label class="block text-sm text-gray-700">Short description</label>
          <textarea
            v-model="description"
            rows="2"
            placeholder="Optional description"
            class="block w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- Encode button -->
    <button
      :disabled="!file || encoding"
      class="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      @click="encode"
    >
      <span v-if="encoding">
        Encoding... {{ progress.current }}/{{ progress.total }}
      </span>
      <span v-else>Encode</span>
    </button>

    <!-- Progress -->
    <div v-if="encoding" class="space-y-2">
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="bg-blue-600 h-2 rounded-full transition-all"
          :style="{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }"
        />
      </div>
      <p class="text-xs text-gray-500">{{ progress.message }}</p>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <!-- Results -->
    <div v-if="result" class="space-y-4">
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-sm text-green-800">
          Encoded {{ formatBytes(result.fileSize) }} into {{ result.numCodes }} QR code{{ result.numCodes !== 1 ? 's' : '' }}.
        </p>
      </div>

      <!-- Download buttons -->
      <div class="flex gap-3 flex-wrap">
        <button
          v-if="result.pdfBlob"
          class="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="downloadPdf"
        >
          Download PDF
        </button>
        <button
          class="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="downloadAllImages"
        >
          Download all images
        </button>
      </div>

      <!-- QR preview grid -->
      <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
        <div
          v-for="(url, i) in result.qrDataUrls"
          :key="i"
          class="relative group cursor-pointer"
          @click="downloadImage(i)"
        >
          <img
            :src="url"
            :alt="`QR code ${i + 1}`"
            class="w-full rounded border border-gray-200"
          />
          <div
            class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center"
          >
            <span class="text-white text-xs font-medium">#{{ i + 1 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
