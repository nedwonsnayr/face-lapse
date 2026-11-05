# ui-revamp — Staff Engineer
- New convention: `Component.module.css` next to `Component.tsx`; tokens only from `index.css` (`--paper`, `--ink`, `--accent`, `--space-*`, `--radius-*`, `--font-display`, …).
- Shared primitives live in `src/components/ui/` (Button, IconButton, Icon).
- Never rename or remove a `data-testid`. Visible button text that tests match (via getByRole/getByText) must be preserved; check before changing copy.
- Inline `style` is allowed only for dynamic values.
