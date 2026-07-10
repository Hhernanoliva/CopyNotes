# 009 - UI, Navigation And Onboarding

## Objective

Define the first user experience and the main layout. CopyNotes should feel editor-first, calm, minimal, and easy to understand without turning into a heavy workspace.

## What Enters

- Editor-first layout.
- Hidden or lightweight navigation.
- Hideable sidebar.
- Hideable drawer/panel for secondary functions.
- Sidebar and drawer responsibilities separated.
- Last opened note restored after first use.
- First-time mini tutorial.
- Editable demo note showing bullets, todos, snippets, tags, and copy.
- Empty state focused on creating first note.
- Help/shortcuts panel.
- Discreet tooltips.
- Warm Bear-like UI copy.
- Mobile panel behavior.

## What Does NOT Enter

- No complex dashboard.
- No three-column power-user UI in MVP.
- No full onboarding course.
- No account setup in onboarding.
- No aggressive PWA install prompt.

## Model Of Data Affected

- settings: `hasCompletedOnboarding`
- settings: `lastOpenedNoteId`
- optional demo note marker
- theme preference
- panel/sidebar UI state, usually not all persisted

## User Flows

- First-time user opens app and sees a mini tutorial.
- User receives or can open an editable demo note.
- User learns `/` commands, copy, tags, snippets through subtle help.
- Returning user opens directly into last note or empty note flow.
- User opens sidebar when needed.
- User opens drawer/panel for secondary tools.
- User uses mobile buttons to open navigation panels.

## Acceptance Criteria

- First use teaches without blocking writing.
- Returning use is fast and does not repeat onboarding.
- Empty state prioritizes creating a note quickly.
- UI copy feels warm but brief.
- Navigation never dominates the editor.
- Sidebar/drawer behavior is predictable on desktop and mobile.
- Onboarding state survives reload.

## Minimum Tests

- First-run onboarding state.
- Last opened note restoration.
- Demo note creation is not duplicated accidentally.
- Sidebar/drawer open-close behavior.
- Help panel opens and lists core shortcuts.
- Mobile viewport navigation smoke test.

## Agent Notes

The user should understand CopyNotes by using it, not by reading a manual. The interface should teach through examples and small hints.
