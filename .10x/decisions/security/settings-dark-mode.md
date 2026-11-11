# Security: settings-dark-mode
- **No new endpoints, server state or third-party code.** The app stays behind Cloudflare Access.
- **Input:** settings are read from `localStorage`, which only same-origin scripts can write. Every field is still type- and range-checked before use. Theme values are allow-listed before they reach a DOM attribute, and nothing is written into HTML or CSS as raw text.
- **Inline pre-paint script:** a static inline script in `index.html`. The app sets no Content-Security-Policy today. If a CSP is ever added, this script needs a hash or nonce.
- **Privacy:** preferences only. No personal data is stored.
