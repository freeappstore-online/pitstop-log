# Pitstop Log

A local-first vehicle fuel and expense tracker, built from the “Car fuel & expense log” idea on the FreeAppStore ideas page.

Live app: https://pitstop-log.freeappstore.online

## Try it

1. Open Dashboard and choose **Try sample data**, or add your own vehicle in **Vehicles**.
2. Select a vehicle, then use **Log** to add fuel fills and expenses.
3. Dashboard shows costs, odometer readings and consumption between consecutive full-tank fills.
4. Use **Backup & restore** to export a JSON backup or preview an import. Imports require an explicit merge or replace choice.
5. The avatar opens **Profile**, where GitHub and Google sign-in options and appearance settings are available.

## Data and offline use

Vehicle logs are stored in this browser's IndexedDB. Signing in does not synchronize these logs between devices. Export backups before clearing browser/site data, and import them to move data to another browser.

The PWA supports offline use after an initial online visit. Available updates require explicit activation and reload; unsaved form edits block activation.

Backups use the shared FAS SDK format with a checksum and strict whole-file validation. The initial version's valid legacy backups can also be imported. Invalid versions, malformed records and damaged checksums are rejected before writing. If a restore write fails, the previous data snapshot is restored when storage remains available.

## Development

Requires Node 22+ and pnpm 10.30.3.

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

## Validation

The sample was independently exercised in Chromium with synthetic data:

- Vehicle, fuel and expense creation, editing, deletion and persistence after reload.
- Weighted consumption: 35 L over 500 km plus 90 L over 1,000 km displays **8.33 L/100km**.
- Valid backup restore, checksum export, invalid import rejection, idempotent merge and rollback after an injected storage failure.
- Avatar/profile navigation, exact return URL preservation, and synthetic signed-in profile rendering with API requests mocked.
- Mobile layouts at 320, 375 and 430 pixels, with normal and enlarged text; narrow form fields stack vertically.
- Actual sequential keyboard typing, modal focus cycling, Escape and trigger-focus restoration.
- Offline deep-link reload and an actual service-worker update blocked by unsaved form edits.

Real OAuth provider authentication was not exercised. App defects found during the test are recorded in this repository's issues #1–#8.
