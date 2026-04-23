---
name: deploy-check
description: Verify deployment readiness before pushing to main
user-invocable: true
disable-model-invocation: true
tools: [Bash, Read, Grep]
---

Before pushing to main, verify all of these:
1. Run `npx tsx src/index.ts` and confirm server starts without errors
2. Grep all files for hardcoded secrets (API keys, tokens, passwords)
3. Verify PORT uses process.env.PORT, not hardcoded 3000
4. Check that .env is in .gitignore
5. Verify all imports resolve correctly
6. Report pass/fail for each check
