<script setup lang="ts">
import { ref, computed } from 'vue'
import { runDecode } from '../lib/decode'
import { SUPPORTED_IMAGE_EXTS } from '../lib/constants'

// State
const files = ref<File[]>([])
const outputFileName = ref('')
const decoding = ref(false)
const progress = ref({ current: 0, total: 0, message: '' })
const result = ref<{ data: Uint8Array; numChunks: number } | null>(null)
const error = ref<string | null>(null)

// Computed
const inputDescription = computed(() => {
  if (files.value.length === 0) return ''
  if (files.value.length === 1) {
    const f = files.value[0]
    const ext = '.' + f.name.split('.').pop()!.toLowerCase()
    if (ext === '.pdf') return `PDF: ${f.name}`
    return `Image: ${f.name}`
  }
  return `${files.value.length} files selected`
})

const acceptTypes = computed(() => {
  const exts = Array.from(SUPPORTED_IMAGE_EXTS)
  return [...exts, '.pdf'].join(',')
})

// File selection
function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    files.value = Array.from(input.files)
    result.value = null
    error.value = null

    // Auto-suggest output filename
    if (files.value.length === 1) {
      const name = files.value[0].name
      // Remove common extensions from input to guess output name
      outputFileName.value = name.replace(/\.(pdf|jpg|jpeg|png|bmp|tiff?|webp)$/i, '') + '_decoded'
    } else {
      outputFileName.value = 'decoded_output'
    }
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    files.value = Array.from(event.dataTransfer.files)
    result.value = null
    error.value = null
    outputFileName.value = 'decoded_output'
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
}

// Decode
async function decode() {
  if (files.value.length === 0) return

  decoding.value = true
  error.value = null
  result.value = null

  try {
    const decodeResult = await runDecode(
      files.value,
      (current, total, message) => {
        progress.value = { current, total, message: message || '' }
      },
    )
    result.value = decodeResult
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    decoding.value = false
  }
}

// Download
function download() {
  if (!result.value) return
  const blob = new Blob([new Uint8Array(result.value.data)])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outputFileName.value || 'decoded_output'
  a.click()
  URL.revokeObjectURL(url)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Info -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
      <p class="font-medium">Supported input formats:</p>
      <ul class="mt-1 list-disc list-inside text-blue-700 space-y-0.5">
        <li>Individual QR code images (<code class="text-xs bg-blue-100 px-1 rounded">qrcode_1.jpg</code>, <code class="text-xs bg-blue-100 px-1 rounded">qrcode_2.jpg</code>, ...)</li>
        <li>A PDF containing QR codes (generated or scanned)</li>
        <li>A photo of printed QR codes</li>
      </ul>
    </div>

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
        :accept="acceptTypes"
        multiple
        class="hidden"
        @change="onFileSelect"
      />
      <div v-if="files.length > 0" class="space-y-1">
        <p class="text-sm font-medium text-gray-900">{{ inputDescription }}</p>
        <p v-if="files.length > 1" class="text-xs text-gray-500">
          {{ files.map(f => f.name).join(', ') }}
        </p>
      </div>
      <div v-else class="space-y-1">
        <p class="text-sm text-gray-600">Drop file(s) here or click to select</p>
        <p class="text-xs text-gray-400">PDF, images, or multiple qrcode_N.jpg files</p>
      </div>
    </div>

    <!-- Output filename -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
      <label class="block text-sm font-medium text-gray-700">Output filename</label>
      <input
        v-model="outputFileName"
        type="text"
        placeholder="decoded_output"
        class="block w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
      />
      <p class="text-xs text-gray-400">
        The name for the reconstructed file when you download it.
      </p>
    </div>

    <!-- Decode button -->
    <button
      :disabled="files.length === 0 || decoding"
      class="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      @click="decode"
    >
      <span v-if="decoding">
        Decoding... {{ progress.message }}
      </span>
      <span v-else>Decode</span>
    </button>

    <!-- Progress -->
    <div v-if="decoding" class="space-y-2">
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

    <!-- Result -->
    <div v-if="result" class="space-y-4">
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-sm text-green-800">
          Reassembled {{ result.numChunks }} chunk{{ result.numChunks !== 1 ? 's' : '' }},
          {{ formatBytes(result.data.length) }} total.
        </p>
      </div>

      <button
        class="bg-blue-600 text-white py-2.5 px-6 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
        @click="download"
      >
        Download reconstructed file
      </button>
    </div>
  </div>
</template>
