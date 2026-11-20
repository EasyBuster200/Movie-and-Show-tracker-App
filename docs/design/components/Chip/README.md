# Chip

A pill-shaped filter toggle, used in rows to narrow a list (All / Shows / Movies on search results).

Only one chip in a row is `selected` at a time unless the filters combine. Add `count` when the number of matches helps choose. Selected chips are `accent` with `on-accent` text. In multi-select rows (genres) set `check` so selected chips also show a check mark, not colour alone. Group long chip sets in a `bg-card` panel with an uppercase `tt-filter-label` heading per group, show about two lines and collapse the rest behind a "+N more" chip.
