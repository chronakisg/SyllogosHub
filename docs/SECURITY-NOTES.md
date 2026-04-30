# Security Notes

## Known accepted risks

### `xlsx` (SheetJS Community Edition) — 2 high CVEs

**Status:** Accepted risk · documented · planned for future replacement

**CVEs:**
- GHSA-4r6h-8v6p-xvw6 — Prototype Pollution (CVSS 7.8)
- GHSA-5pgg-2g8v-p4x9 — Regular Expression DoS (CVSS 7.5)

**Why we accept:**
Both CVEs affect the **parser** (`XLSX.read()`, `XLSX.readFile()`). Our codebase
uses xlsx exclusively for **export** (writing files from trusted DB data via
`XLSX.utils.json_to_sheet` + `XLSX.writeFile`). Audited usage in
`app/members/page.tsx` — 5 call sites, zero parse calls.

There is no user-facing xlsx upload functionality.

**Why no fix:**
The SheetJS team removed patched versions from the public npm registry. Patches
are distributed only via their CDN (https://cdn.sheetjs.com/). `npm audit fix`
reports `fixAvailable: false`.

**Future plan:**
Swap to `exceljs` or `@e965/xlsx` (community fork on public npm) in a dedicated
PR. Drop-in replacement for the limited API surface we use.

**Re-evaluation triggers:**
- If xlsx import functionality is ever added → must swap first
- If a parse call is added anywhere → must swap first

## Audit pseudo-noise (ignored)

- `next` moderate (transitive postcss CVE-79) — fix would require downgrade
  to next@9.3.3 which is absurd. Next 16 doesn't use the vulnerable code path.
- `postcss` moderate — same root cause; build-time only, no runtime exposure.

Last audit run: 2026-04-30
