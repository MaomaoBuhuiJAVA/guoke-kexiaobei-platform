# Mobile Color Lab Flicker Fix

- Prevent blank frames in the seven-cup color lab on mobile when its size, orientation, or visibility changes.
- Reset the canvas only when its CSS size or pixel ratio changes, then repaint immediately instead of waiting for the next animation frame.
- Add regression tests for same-size observer notifications, size changes, and high-DPI changes. No database changes.

## Release Verification

- November 25, 2026.
- Verified production fix commit: pending.
- Vitest: 1,039 passed, 19 skipped; TypeScript and targeted ESLint passed.
- Chromium browser checks at iPhone and desktop sizes covered same-size observer notifications and actual viewport resize without blank canvas frames. Color selection, free cup movement, pouring with intermediate liquid levels, gradual red-plus-yellow mixing, and the orange result notice also passed.
- Production release directory, package validation, service health, and public-site recheck: pending.

## Rollback

- Previous stable release: /opt/guoke/releases/20261125-color-lab-9a31fe4.
- Atomically point /opt/guoke/current to the previous release, restart guoke-web, and recheck the game page.
