# Visual thesis: The impossible archive

## Direction and rationale

The product is drawn as surreal editorial scenery: a moonlit records room where a familiar filing cabinet opens into a weightless cloud of object buckets. It explains the product's central translation—ordinary directories on one side, S3 objects on the other—without borrowing the usual cloud-dashboard gradient or generic terminal mockup. The console becomes the pragmatic catalog desk inside that stranger world: quiet, dense, and tactile.

## Palette

- `ink #17201c`: near-black green for type.
- `paper #f2ecd9`: warm archival paper for the canvas.
- `linen #e4dbc1`: surfaces and dividers.
- `moss #315b48`: primary actions; white text is 7.2:1.
- `persimmon #9f331f`: selected paths and warnings; darkened to preserve small-text contrast on paper.
- `night #101b24`: dark scene ground.
- `mist #9fc9bd`: technical marks and focus rings.
- Semantic success `#286b47`, warning `#8a5814`, danger `#a43b31`.

This is intentionally a single-mode, explicitly painted editorial treatment. Paper and ink keep long documentation readable, while the deep night illustration creates depth without requiring a second theme.

## Type and spacing

Display copy uses Georgia/Charter-style local serif stacks: the literary voice makes the directory/object mismatch feel like an editorial idea. UI and code use system UI and monospace stacks for zero font payload and strong path differentiation. The scale is 14/16/20/26/42/68px. A strict 4px base rhythm yields 8, 12, 16, 24, 32, 48, 72, and 96px spaces. Reading measure tops out at 68 characters.

## Interaction grammar

Controls resemble catalog labels: squared corners with one clipped corner, 1px ink rules, and short all-caps overlines. Orange route lines connect filesystem language to S3 language. The embedded console emphasizes the current bucket/key, keeps upload as the single strong action, supports arrow-key row movement, and shows every mutation in a polite live region. Destructive actions name their target and require confirmation.

## Motion

On entry, the two halves of the hero settle toward the central mapping line over 420ms; console rows arrive with a 40ms stagger. Hover transitions are 160ms and use only opacity/transform. There are no looping animations. Under `prefers-reduced-motion: reduce`, transforms and smooth scrolling are removed and state changes are immediate.

## Original asset plan and provenance

- `site/assets/impossible-archive.webp`: generated specifically for this product with the factory image deployment, then converted locally to WebP. Vite fingerprints this source asset for immutable delivery. Prompt: “Surreal editorial cut-paper illustration for a developer tool landing page. A midnight archival room in impossible perspective: on the left, a warm cream steel filing cabinet with open drawers containing plain folders; on the right, those folders drift through a thin vermilion portal and become small moss-green object-storage cubes floating in a dark teal sky. One tiny desk lamp, crisp paper texture, screenprint grain, restrained cream/moss/persimmon/navy palette, sophisticated 1960s science magazine composition, wide landscape, strong subject on right and calm negative space on left, no people, no logos, no letters, no readable text, no watermark, not 3D glossy, not a UI screenshot.” Deployment: `factory-image`; license: project-original generated asset, 2026-08-27.
- All icons are original inline geometric SVG marks authored for the product, with no external icon set.
