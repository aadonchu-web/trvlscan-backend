---
name: add-route
description: Scaffold a new Express API route following TRVLscan patterns
user-invocable: true
tools: [Read, Write, Edit]
---

When creating a new route:
1. Read src/routes/flights.ts as the reference pattern
2. Create new route file in src/routes/ using TypeScript
3. Use express.Router(), async/await, try/catch error handling
4. Add route import and app.use() in src/index.ts
5. Never use callbacks, always async/await
