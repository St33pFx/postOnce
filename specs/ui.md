# PostOnce UI & Motion Specification

**Status:** Approved V1 UI baseline — 2026-09-18

## Purpose and authority

This document is the presentation and motion source of truth for PostOnce. Feature specifications control what the product does; this document controls how that behavior is presented and animated. It covers identity, typography, layout, components, responsive behavior, interaction, accessibility, reduced motion and performance.

PostOnce should feel like editorial production software: strong typographic hierarchy, condensed display type, technical labels, thin rules, intentional asymmetry, generous media and restrained motion. The reference is an original direction, never a reproduction of another site's branding, layout or assets.

V1 is not a portfolio, scroll-jacking experience, 3D/WebGL demo, rounded-card SaaS template, glassmorphism or gradient-heavy interface. Motion is hierarchy, not decoration, and never delays publishing.

## Tokens

```css
--ui-bg: #111110; --ui-surface: #171716; --ui-surface-2: #1D1C1A;
--ui-ink: #F1EDE4; --ui-muted: #918D84; --ui-dim: #66635D;
--ui-line: rgba(241,237,228,.20); --ui-line-strong: rgba(241,237,228,.40);
--ui-accent: #FF3B0A; --ui-accent-hover: #FF5428; --ui-accent-ink: #111110;
--ui-success: #9ED6AC; --ui-warning: #E4B75D; --ui-danger: #FF746C;
--radius-control: 2px; --radius-media: 4px; --radius-status: 999px;
```

Display type uses `Impact`, `Haettenschweiler`, `Arial Narrow Bold`, `Arial Narrow`, sans-serif. Body type uses system sans; technical labels use a system monospace. Display headings are uppercase with tight tracking; micro labels are 10–12px and letter-spaced.

## Layout and components

The application uses a 12-column editorial grid with responsive gutters and a maximum content width around 1600–1760px. The draft workspace keeps its two-column model: a sticky technical draft index and an active editor. Its bands are `01 VIDEO`, `02 COVER`, `03 DESTINATIONS`, and `04 PUBLISH`, separated by rules rather than large rounded cards.

The header is a restrained utility row with uppercase mono labels, navigation and account/theme actions. Buttons are rectangular: orange primary, outlined secondary, text actions with editorial underline, and restrained danger actions. Inputs and selects use dark surfaces, thin borders, square controls and orange focus. Status chips may be pills only when compact and semantic. Video and cover previews always use `object-fit: contain` and preserve their source ratio.

Destination rows expose platform, account, status and toggle. Details remain aligned beneath the row. Advanced options are closed by default, expose immediate `aria-expanded` and `aria-controls`, and never hide required errors or actions.

## Motion

GSAP with ScrollTrigger provides reusable page, section, line, media and disclosure reveals. Lenis may smooth desktop fine-pointer scrolling and must be integrated with the GSAP ticker and ScrollTrigger; touch devices retain native scrolling. Default easing is `power3.out`; micro interactions are 120–220ms, controls 220–380ms and major reveals 450–700ms. Motion uses opacity, transforms and clip paths, never per-frame React state for decoration. Scroll velocity effects are limited to decorative wrappers (≤1.5deg skew and ≤8px translation), never forms, controls, media controls or publishing state.

Content is visible and usable before the motion layer initializes. Motion cleanup kills contexts, triggers, ticker callbacks and Lenis on unmount. If GSAP or Lenis fails, publishing remains usable.

## Responsive and accessibility

Supported targets are 1920, 1440, 1024, 768 and 390px. Desktop uses the editorial two-column workspace; tablet reduces gutters and rail width; mobile becomes one column with the draft selector above the editor. Media becomes full width, controls remain at least 44px, and `document.documentElement.scrollWidth <= window.innerWidth` must hold.

Semantic headings, labels, keyboard operation, visible 2–3px orange focus outlines and ARIA state are mandatory. Color never communicates state alone. `prefers-reduced-motion: reduce` disables Lenis and velocity effects, removes major transforms, finalizes reveals and keeps all content immediately available.

## UI requirements and acceptance criteria

### REQ-UI-001 — Visual identity
**GIVEN** the user opens PostOnce **THEN** charcoal, ivory and orange provide the primary visual system and green is reserved for semantic success.

### REQ-UI-002 — Typographic hierarchy
**GIVEN** a workflow is open **THEN** condensed display headings, technical labels and system body text communicate hierarchy.

### REQ-UI-003 — Editorial grid
**GIVEN** Draft Workspace opens on desktop **THEN** it presents an editorial index, structured bands and rules without a stack of rounded SaaS cards.

### REQ-UI-004 — Interaction hierarchy
**GIVEN** primary, secondary, text and danger actions coexist **THEN** each uses its documented visual hierarchy.

### REQ-UI-005 — Motion system
**GIVEN** motion is enabled **WHEN** a major section enters the viewport **THEN** its index, heading, rule and content reveal with the documented language without blocking interaction.

### REQ-UI-006 — Progressive disclosure
**GIVEN** advanced controls are closed **THEN** secondary controls are hidden; **WHEN** expanded **THEN** the region is visible and ARIA state is updated immediately.

### REQ-UI-007 — Media integrity
**GIVEN** a vertical video or cover is previewed **THEN** its complete aspect ratio is visible without stretching or cropping.

### REQ-UI-008 — Responsive behavior
**GIVEN** any supported viewport **THEN** there is no horizontal overflow and primary controls remain reachable.

### REQ-UI-009 — Accessibility
**GIVEN** keyboard navigation **THEN** focus is visible and all controls remain operable without a pointer.

### REQ-UI-010 — Reduced motion
**GIVEN** reduced motion is requested **THEN** Lenis and decorative transforms are disabled while content remains usable.

### REQ-UI-011 — Progressive enhancement
**GIVEN** motion has not initialized **THEN** functional content is visible and publishing remains usable.

### REQ-UI-012 — Performance
**GIVEN** a route mounts and unmounts **THEN** motion resources are cleaned up without uncontrolled scroll listeners or layout-heavy animation.

### REQ-UI-013 — State language
**GIVEN** a workflow state changes **THEN** loading, ready, warning, failure, unknown and published states use text plus visual treatment.

### REQ-UI-014 — Product-first motion
**GIVEN** an animation is playing **WHEN** the user performs a functional action **THEN** it is immediately available and animation does not intercept it.
