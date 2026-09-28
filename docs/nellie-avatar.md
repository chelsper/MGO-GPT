# Nellie Avatar

Created September 28, 2026 from the user's supplied dolphin reference using the
built-in image generation tool. This is a recreated illustration, not a recovered
official vector original.

## Assets And Behavior

- `docs/assets/nellie-ju-master.png`: high-resolution master with transparency.
- `apps/web/src/assets/nellie-ju-v1.png`: 256-pixel runtime PNG (approximately
  77 KB), sized for a 64-pixel dashboard avatar and high-density displays.
- `DashboardAssistantAvatar` imports the runtime asset through Vite so production
  gets a content-hashed, same-origin URL. The full master is not imported or sent
  to browsers. No image hosting service or runtime generation is needed.
- The dashboard and organization-settings preview use the same component.
  Mobile dashboard size is 50 pixels. Explicit width/height reserve layout space;
  decorative markup preserves the launcher's existing accessible name.
- The configurable Compass remains available and also serves as an image-error
  fallback. Existing Dolphin settings need no migration or profile edit.
- The helper stays dashboard-only; the settings preview is not an active helper.
  Data requests, permissions, reminder timing, and NXT behavior are unchanged.

## Generation Prompt

Use case: identity-preserve. Asset type: production dashboard helper avatar,
Nellie for Jacksonville University. Edit target: the attached tiny dolphin mascot
screenshot. Recreate the SAME friendly smiling gray dolphin character and pose as
a clean high-resolution polished 2D mascot badge, NOT an enlarged blurry
screenshot. Preserve the recognizable long rounded dolphin snout facing right,
cheerful teal eye, gray head with light gray mouth/belly, raised right-side flipper
in a friendly wave, dark forest-green shirt with the exact white letters 'JU',
and soft mint circular backdrop. Maintain the illustrated character's friendly
adult university mascot personality, not angry or baby-like. Crisp smooth
confident dark teal outlines, flat shaded gray/teal/forest-green fills, subtle
tasteful shading only, no 3D, no realistic skin. Square 1024x1024 composition, mint
round badge fills about 94 percent of canvas with narrow even margins, upper-body
dolphin prominently filling the badge. Keep the entire mint circle and flipper
inside the frame. Transparent pixels outside the circular badge, no white square
mat, no cast shadow, no extra text, no watermark, no extra objects. Simplify
micro-details so the face and wave read clearly at 48 pixels. Produce one avatar
asset only.
