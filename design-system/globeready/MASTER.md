# GlobeReady interface system

This file is the design source of truth. Page-specific guidance in `design-system/pages/` may refine layout, but it must not override the accessibility, color, navigation, or interaction rules below.

## Direction

GlobeReady is a calm, practical student workspace—not a luxury brand or entertainment product. Interfaces should feel trustworthy, restrained, and easy to scan under stress.

- Warm off-white page background with white working surfaces
- Slate text, one muted-blue action color, pale sage confirmation states
- Flat surfaces, quiet borders, minimal shadows, and modest 8–10px radii
- System sans-serif typography; no external font request is required
- Five main destinations: Home, Plan, Updates, Documents, and Ask
- Secondary pages use short, horizontal sub-navigation
- Motion is optional and subtle; the product remains complete with motion disabled

## Production tokens

The canonical implementation is `client/src/design-system.css`.

| Role | Value | Token |
|---|---:|---|
| Page background | `#faf9f6` | `--gr-bg` |
| Surface | `#ffffff` | `--gr-surface` |
| Soft surface | `#f4f3ee` | `--gr-surface-soft` |
| Primary text | `#1f2937` | `--gr-ink` |
| Secondary text | `#4f5b6b` | `--gr-muted` |
| Border | `#d9d7cf` | `--gr-line` |
| Strong border | `#b9b6ab` | `--gr-line-strong` |
| Primary action | `#2c5a87` | `--gr-accent` |
| Strong action | `#1f4468` | `--gr-accent-strong` |
| Selected background | `#e9eff5` | `--gr-accent-soft` |
| Success background | `#eaf0ea` | `--gr-sage-soft` |
| Success text | `#2b5640` | `--gr-sage-ink` |
| Danger | `#9f2f1d` | `--gr-danger` |
| Focus | `#1f4468` | `--gr-focus` |

Spacing uses a 4px base scale. Every interactive target is at least 44px in both relevant dimensions.

## Components

- Buttons use one of three clear roles: primary, secondary, or danger. Do not use gradients, glow, lift, or scale effects.
- Cards and panels use white surfaces, a 1px neutral border, and no decorative shadow.
- Inputs use persistent labels, a 44px minimum height, and an unmistakable focus ring.
- Status must include text; color alone never communicates meaning.
- Empty, loading, offline, success, warning, and error states use shared components and plain language.
- Use Lucide icons only where an icon improves recognition. Icons never replace an essential text label.

## Responsive navigation

- Desktop: persistent left sidebar, search and reminders above the page content.
- Mobile: fixed bottom navigation for the five primary destinations plus an Account menu.
- Page content must not sit behind fixed navigation or create horizontal viewport scrolling.
- Sub-navigation may scroll horizontally, with complete labels kept visible.

## Accessibility requirements

- One descriptive `h1` per page and semantic heading order
- Skip link to the main content
- Visible `:focus-visible` ring on every control
- WCAG AA contrast for normal text and meaningful UI boundaries
- Keyboard access for menus, dialogs, forms, filters, and destructive actions
- `prefers-reduced-motion` and the in-app reduced-motion preference respected
- Standard, large, and largest text modes remain usable without clipping
- Controls remain usable at 390px, 768px, 1024px, and 1440px widths

## Content principles

- Lead with the task a student can complete, not product terminology.
- Clearly distinguish official-source facts, GlobeReady explanations, and user-entered information.
- Never imply legal certainty, automatic eligibility, or that GlobeReady replaces a DSO, attorney, government source, or emergency service.
- Keep destructive actions explicit and confirm their scope.

## Forbidden patterns

- Black/gold luxury styling, aurora gradients, glassmorphism, or decorative animation
- Hidden navigation, icon-only primary actions, or more than one primary CTA per section
- Hover effects that move layout
- Color-only statuses, invisible focus states, or touch targets below 44px
- Dense dashboards that expose every feature at once
- External fonts or ornamental media that slow the free public beta without improving a task

## Review checklist

- The five-destination information architecture is intact.
- The page uses production tokens rather than one-off colors.
- Desktop and 390px layouts have no horizontal overflow.
- Keyboard focus, reduced motion, and all three text sizes work.
- Forms preserve user input after recoverable errors.
- Loading, empty, offline, failure, and success states are understandable.
- Claims and reminders state their source and limitations.
