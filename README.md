# Shadcn-UI Template Usage Instructions

## technology stack

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

All shadcn/ui components have been downloaded under `@/components/ui`.

## File Structure

- `index.html` - HTML entry point
- `vite.config.ts` - Vite configuration file
- `tailwind.config.js` - Tailwind CSS configuration file
- `package.json` - NPM dependencies and scripts
- `src/app.tsx` - Root component of the project
- `src/main.tsx` - Project entry point
- `src/index.css` - Existing CSS configuration
- `src/pages/Index.tsx` - Home page logic

## Components

- All shadcn/ui components are pre-downloaded and available at `@/components/ui`

## Styling

- Add global styles to `src/index.css` or create new CSS files as needed
- Use Tailwind classes for styling components

## Development

- Import components from `@/components/ui` in your React components
- Customize the UI by modifying the Tailwind configuration

## Note

- The `@/` path alias points to the `src/` directory
- In your typescript code, don't re-export types that you're already importing

# Commands

**Install Dependencies**

```shell
pnpm i
```

**Add Dependencies**

```shell
pnpm add some_new_dependency

**Start Preview**

```shell
pnpm run dev
```

**To build**

```shell
pnpm run build
```

## Show years and 2027 Finance Result

- The header switches the entire app between 2026 and 2027. Switching reloads the app so pending state and cached data cannot cross years. Links retain `?year=2027`; legacy public approval/profile links without a year continue to use 2026.
- All 2026 database paths remain unchanged. 2027 business data and uploads live under `years/2027`. Accounts and email configuration remain shared; the external scheduling inventory connection is unchanged. No 2026 records are copied or migrated.
- Only the 2027 Finance Result page has Excel controls. It temporarily retains 2026 Finance Result show names as unsaved placeholder rows, with no copied dates, dealers, finance codes or amounts. Download the template with these names prefilled, fill rows from row 8, review the import preview, then import. Untouched name-only rows are skipped. Each matching 2027 show replaces one placeholder; unfilled names remain visible. Export includes all shows and optional finance columns, regardless of the current search or hidden columns, with the same Budget / Actual / Sales groups and a totals row.
- Dates must be valid 2027 dates in `YYYY-MM-DD` format (Excel date cells also work). Keep exported Show IDs; leave IDs blank for new shows. Blank IDs match existing shows by name/dealership/start date or Internal SO. Ambiguous matches, duplicate rows, invalid values and non-2027 data are rejected before saving.
- Imports upsert listed shows, their budgets, Internal SO and financial summaries in one atomic write. Other shows, team assignments and individual orders remain intact. An import replaces previous imported totals and clears a manual Actual override for the imported show. Imported sales totals are authoritative for that show's Finance Result, Dashboard and show summary until reimported; they are not added to individual orders or fabricated as order records. Model/salesperson breakdowns still require actual order details.
- Firebase deployment rules must permit the same authorized users to access the new `years/2027` database/storage tree. This repository does not contain the deployed rules. Local integration tests use mocked Firebase and never write production data.

### Verification

With Node 22.18+ (native TypeScript stripping) or Node 24, run `pnpm test:finance-year` for workbook round-trip, validation, matching and year-isolation tests. Run `pnpm build` for production compilation.

For the optional browser test, start the dev server on port 5173, install Playwright in your test environment (or set `PLAYWRIGHT_MODULE` to its absolute module path), then run `node tests/year-flow.browser.mjs`. It uses installed Edge by default; set `BROWSER_CHANNEL=chrome` for Chrome. Screenshots and test exports are saved in the ignored `.test-output` directory.
