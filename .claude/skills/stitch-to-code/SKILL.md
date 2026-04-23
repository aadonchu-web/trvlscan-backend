---
name: stitch-to-code
description: Convert Google Stitch design export to Next.js page component
user-invocable: true
tools: [Read, Write, Edit]
---

When converting a Stitch design:
1. Read the exported HTML/CSS from the provided file
2. Convert to Next.js page component with TypeScript
3. Replace all inline CSS with Tailwind utility classes
4. Use Plus Jakarta Sans / Inter fonts only
5. Follow light color theme, compact layout
6. Place in the correct app/ directory in trvlscan-frontend
7. Ensure mobile-responsive with Tailwind breakpoints
