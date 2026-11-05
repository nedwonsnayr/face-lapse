# ui-revamp — Senior Engineer
- Convert each component by swapping `style={styles.x}` → `className={s.x}`; compose conditional classes with a tiny `cx()` helper.
- Keep the component logic diff minimal so behavior regressions are unlikely; most of the diff should be CSS.
- Tricky parts: dnd-kit sortable cards (keep the transform inline), DatePicker hover handlers (move to CSS), the sticky studio pane height (`calc(100dvh - topbar)`), and drop-anywhere without breaking the dropzone's own drag events.
