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
- Only the 2027 Finance Result page has Excel controls. It temporarily retains 2026 show names and their original start/finish dates as reference information, without copying dealers, finance codes or amounts. Download the prefilled template and fill rows from row 8. Untouched reference rows are skipped. Each matching 2027 show replaces one placeholder; unfilled names remain visible. Export includes all shows and optional finance columns, regardless of the current search or hidden columns, with the same Budget / Actual / Sales groups and a totals row.
- `Month 2027` is an independent planning field, shown in the 2027 web table and Excel column Z. It accepts month names, abbreviations, numbers 1–12, `2027-MM`, or Chinese month notation such as `3月`, and stores the full English month name. A month can be imported before dealership or exact 2027 dates are known. The original 2026 dates stay as references and never become a 2027 calendar event or mark the show as finished. Replace them with confirmed 2027 dates when available. Untouched copied dates alone do not create shows.
- Dates use `YYYY-MM-DD` (Excel date cells also work); a row uses either 2026 reference dates or actual 2027 dates. Keep exported Show IDs; leave IDs blank for new shows. Blank IDs match existing shows by name/dealership/start date (or reference date) or Internal SO. Ambiguous matches, duplicate rows, invalid values and a Year other than 2027 are rejected. Older templates without `Month 2027` remain importable without clearing saved months.
- Imports upsert listed shows, their budgets, Internal SO and financial summaries in one atomic write. Other shows, team assignments and individual orders remain intact. An import replaces previous imported totals and clears a manual Actual override for the imported show. Imported sales totals are authoritative for that show's Finance Result, Dashboard and show summary until reimported; they are not added to individual orders or fabricated as order records. Model/salesperson breakdowns still require actual order details.
- Firebase deployment rules must permit the same authorized users to access the new `years/2027` database/storage tree. This repository does not contain the deployed rules. Local integration tests use mocked Firebase and never write production data.

### Verification

With Node 22.18+ (native TypeScript stripping) or Node 24, run `pnpm test:finance-year` for workbook round-trip, validation, matching and year-isolation tests. Run `pnpm build` for production compilation.

For the optional browser test, start the dev server on port 5173, install Playwright in your test environment (or set `PLAYWRIGHT_MODULE` to its absolute module path), then run `node tests/year-flow.browser.mjs`. It uses installed Edge by default; set `BROWSER_CHANNEL=chrome` for Chrome. Screenshots and test exports are saved in the ignored `.test-output` directory.
