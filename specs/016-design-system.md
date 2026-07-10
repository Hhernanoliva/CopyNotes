# 016 - Design System

## Objective

Define the approved visual direction for CopyNotes before interface implementation begins. This document should help future agents build a professional, consistent app without hard-coding an aesthetic that becomes difficult to change later.

Approved: 2026-07-09.

## Design Direction

The approved direction is called **Quiet Ink**.

Quiet Ink means:

- calm
- dark-first
- writing-centered
- minimal
- warm but not beige-heavy
- polished without looking decorative
- closer to Bear and Workflowy than to a SaaS dashboard

CopyNotes should feel like a focused personal writing tool, not a project management dashboard.

## Design System Swappability Rule

The design system must be easy to replace later.

This is a core rule. Components should not be tied directly to the Quiet Ink look. They should use semantic tokens and shared component patterns so the app can change visual identity without rewriting product logic.

In practical terms:

- Components must use semantic tokens such as `surface`, `text`, `muted`, `border`, `accent`, and `danger`.
- Components should not contain raw color values unless they are defining the token system itself.
- Layout, spacing, typography, colors, radius, shadows, and motion should be centralized.
- The editor, storage, snippets, tags, backup, export/import, search, sync, and MCP logic must not depend on visual theme choices.
- A future aesthetic refresh should mostly change tokens and component styles, not product behavior.

Think of the design system like clothing for the app. The body of the product should stay healthy even if the outfit changes.

## Product Feel

CopyNotes should feel:

- immediate: user opens the app and can write right away
- quiet: controls are available but do not shout
- trustworthy: backup, import, and delete actions feel clear and safe
- personal: the app feels like a private writing space
- efficient: copy, snippets, tags, and search are fast to reach
- accessible: keyboard, mobile, and readable contrast are first-class

## Visual Style

Use restrained minimalism.

Do:

- Keep the editor visually dominant.
- Use subtle separators and spacing instead of heavy boxes.
- Use cards only for repeated items, dialogs, snippets, and genuinely framed tools.
- Keep sidebars and drawers quiet.
- Use clear states for hover, focus, active, disabled, selected, copied, saved, and error.
- Use one main accent color and a few semantic support colors.

Avoid:

- dashboard-heavy layouts
- generic SaaS styling
- Notion cloning
- decorative gradients
- gradient orbs, blobs, or bokeh backgrounds
- neon glow effects
- heavy glassmorphism
- nested cards
- excessive rounded corners
- purple/blue AI-style gradients
- beige/cream dominance
- dark blue/slate dominance
- emoji as interface icons

## Theme Strategy

Dark mode is the primary product identity. Light mode must still be polished and usable.

The app should ship with two complete themes:

- Quiet Ink Dark
- Quiet Ink Light

Both themes must use the same semantic token names so switching themes does not require component rewrites.

## Color System

Use semantic tokens rather than raw color names in components.

### Core Semantic Tokens

- `background`: main app background
- `surface`: sidebar, panels, menus, elevated areas
- `surface-subtle`: quieter surfaces and soft grouped areas
- `surface-hover`: hover state on clickable rows
- `text`: primary readable text
- `text-muted`: secondary text
- `text-faint`: placeholder text and quiet metadata
- `border`: standard separators
- `border-strong`: focused or selected border
- `accent`: primary action accent
- `accent-muted`: low-emphasis accent background
- `success`: completed or safe confirmation
- `warning`: backup/import caution
- `danger`: destructive actions
- `focus-ring`: keyboard focus and accessibility outline

### Quiet Ink Dark

Recommended starting values:

- `background`: warm charcoal
- `surface`: slightly lifted charcoal
- `surface-subtle`: soft charcoal layer
- `text`: warm white
- `text-muted`: warm gray
- `text-faint`: dim gray
- `border`: subtle warm gray line
- `accent`: restrained amber
- `success`: muted sage green
- `warning`: amber
- `danger`: softened red
- `focus-ring`: amber or soft blue, depending on contrast

### Quiet Ink Light

Recommended starting values:

- `background`: soft paper white
- `surface`: clean white
- `surface-subtle`: quiet warm gray
- `text`: ink charcoal
- `text-muted`: medium warm gray
- `text-faint`: light warm gray
- `border`: soft gray line
- `accent`: restrained amber
- `success`: muted green
- `warning`: amber
- `danger`: red
- `focus-ring`: amber or soft blue, depending on contrast

## Typography

Recommended font direction:

- Primary app font: Atkinson Hyperlegible.
- Fallback: system sans-serif.
- Code font: system monospace.

Reason: CopyNotes is a writing app. Readability matters more than decorative personality.

Typography should feel:

- clear
- calm
- readable for long sessions
- comfortable on mobile
- not oversized inside compact UI

Suggested scale:

- body: 16px
- small UI text: 13px or 14px
- labels: 12px or 13px
- note title: 28px to 36px depending on viewport
- section headings: 16px to 20px

Do not scale font size directly with viewport width.

## Layout

The editor must be the first visual priority.

Desktop:

- hideable sidebar for notes, tags, and snippets
- central editor with comfortable reading width
- optional drawer/panel for secondary tools
- no heavy three-column default layout

Mobile:

- editor first
- navigation through clear buttons
- sidebar and drawer become full-screen or near full-screen panels
- no squeezed desktop columns
- touch targets at least 44px

Reading width:

- Long writing content should not stretch edge to edge on desktop.
- The editor should feel roomy but not scattered.

## Component Principles

Buttons:

- Use Lucide icons when a clear icon exists.
- Use text labels when meaning would otherwise be unclear.
- Keep primary actions rare.
- Copy actions should be discoverable but quiet.

Inputs:

- Labels should be visible when the field is not obvious.
- Error messages should appear near the problem.
- Mobile keyboard behavior should match the input type.

Dialogs:

- Use for confirmation, import, export, settings, and dangerous actions.
- Keep copy short and clear.
- Always provide a safe exit.

Sidebar:

- Secondary to the editor.
- Useful, not dominant.
- Collapsible.

Drawer:

- For focused secondary work such as snippets, search, backup, or details.
- Do not turn the drawer into a second main app.

Tags:

- Small, readable, and calm.
- Use color subtly.
- Do not turn tags into a loud rainbow system.

Snippets:

- Fast to browse and insert.
- Favorites should be visually easy to find.
- Snippets should feel like reusable text, not a second full editor.

## Editor Design

The editor is the center of the app.

It should support:

- clean bullet rows
- clear nesting
- todo/check blocks
- code/snippet-code blocks
- separators
- collapsed parent blocks
- quiet copy controls
- keyboard focus clarity

Copy controls should appear on hover and keyboard focus, but important copy actions must also be reachable without hover.

## Motion

Motion should be subtle.

Use:

- small opacity and transform transitions
- 120ms to 180ms for basic UI feedback
- up to 240ms for drawers and dialogs
- no decorative animation
- no GSAP for MVP interface work
- no motion that blocks writing

Always respect reduced-motion preferences.

## Accessibility

Accessibility is part of visual quality.

Required:

- visible keyboard focus
- contrast that meets WCAG AA
- touch targets at least 44px
- readable mobile text
- no hidden hover-only critical actions
- icon-only buttons must have accessible names
- modals and drawers must manage focus correctly
- color must not be the only meaning signal

## State Design

The app should define states for:

- default
- hover
- active/pressed
- keyboard focus
- selected/current
- disabled
- loading
- empty
- saved
- copied
- warning
- error
- destructive confirmation

Do not treat success and error feedback as afterthoughts. CopyNotes needs to feel trustworthy.

## Design Tokens To Prepare

At project setup, prepare tokens for:

- colors
- typography
- spacing
- radius
- shadow/elevation
- borders
- z-index/layers
- motion duration
- motion easing
- editor indentation
- icon sizes
- touch target sizes

The first implementation can keep the token set simple, but components should be built as if the design can change later.

## Anti-Patterns

Avoid:

- raw hex colors inside components
- spacing invented per component
- one-off button styles
- hard-coded dark mode values inside feature logic
- UI components that directly contain storage behavior
- generic empty states
- aggressive onboarding
- permanent visible copy buttons beside every block
- relying only on hover for mobile-critical actions
- making backup/import warnings look scary

## Acceptance Criteria

- The app has dark and light themes.
- Components use semantic tokens rather than hard-coded theme values.
- The editor is visually dominant.
- Navigation is secondary and hideable.
- Mobile layout remains fully usable.
- UI remains readable and accessible.
- Future visual redesign is possible without replacing storage, editor logic, export/import, search, snippets, tags, sync, or MCP modules.

## Agent Notes

Quiet Ink is the approved first outfit. It is not a prison.

Build the visual system so the product can later become warmer, sharper, more playful, more premium, or more utilitarian without a rewrite.
