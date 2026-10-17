# PDF.js (self-hosted)

Mozilla PDF.js **v6.4.299**, legacy build (for older browsers such as car and phone browsers), from the `pdfjs-dist@6.4.299` npm package. Apache-2.0, see `LICENSE`.

Only what `viewer.html` needs is kept:

- `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` (from `legacy/build/`)
- `standard_fonts/`: fonts for PDFs that don't embed their own (e.g. Arial/Helvetica)
- `wasm/`: JBIG2 / JPEG 2000 / colour decoders used by scanned manuals, plus their no-WebAssembly fallbacks

Not included: the full Mozilla viewer UI, CJK cmaps, scripting (quickjs), source maps.
