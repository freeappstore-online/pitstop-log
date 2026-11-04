# Editable FreeAppStore starter

This source is app-owned after scaffolding. Keep existing screens, layouts and data.
The SDK Shell is the supported default; a custom accessible frame is supported.
Keep a reachable Profile in both auth states, shared theme/text preferences,
keyboard navigation, visible focus, loading/error feedback and page zoom.
Public screens stay public; gate private features at their data boundary.
Share the existing SDK/Auth instance with Shell, Profile and connected features.

Choose device-local, private-account, public-shared or room storage for the feature.
Never treat collections or room broadcasts as private storage. Do not ask end users
for developer API keys: the SDK proxy supports server-side key injection.
No payments, ads or direct trackers. Preserve SDK Tailwind @source and @theme wiring.

Use fas add <capability> --dry-run for infrastructure changes. Resolve reported
package prerequisites before applying; root recipe imports need a root SDK dependency.
Keep edited capability files and review conflicts rather than overwriting them.
Keep one PWA controller and register busy guards for unsaved work and capture.

Canonical source and guidance:
https://github.com/freeappstore-online/platform/blob/main/docs/composable-starter-contract.md
https://github.com/freeappstore-online/platform/blob/main/docs/starter-release.md
https://github.com/freeappstore-online/platform/blob/main/CONTRIBUTING.md#updating-the-external-app-starter-repositories
