# 005 - Snippets

## Objective

Let users save reusable content and insert it back into notes. Snippets can start simple, but the model must support future templates and richer libraries.

## What Enters

- Create snippet from block.
- Create snippet from short text.
- Snippet as independent saved content.
- Snippet section/library.
- Favorite/pinned snippets.
- Insert snippet into current note.
- Tags on snippets.
- Search/filter snippets if useful through the shared search/tag system.

## What Does NOT Enter

- No complex template variables in MVP.
- No team snippet library.
- No AI snippet generator.
- No paid/pro snippet limits in MVP.

## Model Of Data Affected

Snippets use:

- `id`
- `name`
- `content` or block snapshot
- optional source IDs
- tags
- favorite state
- timestamps
- soft delete

## User Flows

- User writes a useful block and saves it as a snippet.
- User opens snippets section.
- User favorites a snippet.
- User inserts a snippet into the current note.
- User deletes a snippet and it is soft deleted.
- Original block is deleted but snippet still exists.

## Acceptance Criteria

- Snippets are independent from source blocks after creation.
- Favorite snippets are easy to access.
- Inserting a snippet creates normal blocks/content in the target note.
- Snippet actions do not break note hierarchy.
- Snippets can have tags.
- UI is simple and not a second full editor.

## Minimum Tests

- Create snippet from block snapshot.
- Delete source block and verify snippet remains.
- Favorite/unfavorite snippet.
- Insert snippet into note.
- Filter snippets by tag if implemented.

## Agent Notes

Snippets are reusable saved content, not live references. This prevents surprises for users and makes backup/export safer.
