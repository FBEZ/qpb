<p align="center">
  <img src="assets/logo.svg" width="128" alt="qpb logo">
</p>

# qpb - QR Code Paper Backup

Encode any file into printable QR codes and decode them back. All processing happens client-side -- no data leaves your browser.

## Features

- **Encode**: split a file into QR code chunks, generate a printable A4 PDF with configurable grid density
- **Decode**: scan QR codes from a PDF or camera to reconstruct the original file

## Tech Stack

Vue 3, TypeScript, Vite, Tailwind CSS

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

The production build is output to `dist/`.
