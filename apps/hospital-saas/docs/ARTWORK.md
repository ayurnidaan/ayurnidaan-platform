# Botanical clay artwork

File: `public/images/clay-botanical.png`

Generated with the built-in image generation tool, with `transparent_background: true`. The delivered PNG preserves the generated alpha channel and is used in the sidebar, overview and sign-in page. There are no rectangular photographic backgrounds in the interface. Lucide SVG icons and the leaf brand mark remain code-native vectors.

Exact prompt:

> Use case: stylized-concept. Asset type: transparent botanical illustration for an Ayurvedic hospital patient management dashboard. Create one beautifully sculpted clay mortar and pestle in rich dark forest green, with a few soft white clay tulsi leaves and a tiny warm brushed gold accent on the rim. Quiet premium tactile claymorphism, rounded forms, soft matte ceramic surface, elegant restrained composition, gentle studio lighting. Three-quarter view, complete object centered with ample transparent padding. Real alpha transparent background, no backdrop, no floor plane, no checkerboard, no text, no letters, no watermark. Small tasteful dashboard decorative artwork, clean silhouette, readable at 180 pixels.

Verification: the browser test loads the same asset onto a canvas and checks transparent corner pixels plus visible center pixels. The image generation result is copied into this repository, so the app does not depend on the generation tool's local output directory.
