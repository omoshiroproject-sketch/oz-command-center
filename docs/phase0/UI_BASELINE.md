# Existing UI baseline

Recorded on 2026-08-23 before Phase 0 planning changes. This review changes no
rendered UI source. The current production design remains the visual contract.

## Visual characteristics to preserve

- Desktop three-column command-center layout: projects / OZ core / live chat.
- Black and blue cinematic palette, fine borders, compact technical typography.
- Central animated OZ orb and the LISTENING / THINKING / SPEAKING state language.
- Project and OZ Network drawers, top status bar, and bottom context controls.
- Existing 16:9 filming-friendly density and hierarchy.

Mobile may be reflowed into the specified four-tab PWA, but it must reuse this
design system rather than introduce a separate visual identity.

## Source fingerprint

```text
f931e3799af4cbe9503dc84aab5fe7e9933bfea80a32aa48f3ae69aafcc6f58b  app/page.tsx
18a90d71bbe0da64d0bd176d091079d8451caa38100151577f1d81331481ffd1  app/globals.css
4a883777e61ade66aae891d4d0a52b4acde4155e0d113c691efb5e8296b06124  public/app.js
db9d99ac508289de932f8212cad6de2975adfa28d0695e24f02e8090c8c20fbf  public/scenarios.js
827b2b1d8c089c3a761fa8d491b7f517447f3fc1d141164a728f6458fb4862f8  public/live-oz.js
0bd01c27d64d15f6d2dfcb1782068f9fc84172f1d500627a3887afbcc8ad0666  public/oz-network.js
```

A screenshot set at desktop 16:9 and iPhone-equivalent widths is a Phase 0
execution task. The hashes above are the source-level preservation evidence for
this planning-only review version.

## Approved Phase 1A Network extension

The confirmation queue was added inside the existing OZ Network drawer after a
local authentication test proved that persisted review candidates had no
visible review surface. This is a functional extension required by
specification sections 6.4, 21 Phase 1, and 23.1. It preserves the desktop
three-column grid, palette, orb, typography, primary panels, and drawer visual
language. No deployment or Sites version was created.

```text
76c57863bc7ca944c43dabe4228e504ab5d834d04e9f867adaa5781b93a7186b  app/page.tsx
ca7cd39696fb8e8d158714e1570fb75761187db9d3104cfa7fe21f278897b8fa  app/globals.css
2fabe079b9fa1bc8bd62ed29e4879ea3710e229f0968b38f5028ec578a0a4373  public/oz-network.js
```
