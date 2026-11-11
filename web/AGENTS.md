# AGENTS.md

<!-- BEGIN:foblex-flow-agent-rules -->

## Foblex Flow (`@foblex/flow`)

Before writing any code that uses `@foblex/flow`, read the AI guide bundled with the
package: `node_modules/@foblex/flow/AI.md`. It contains the verified API surface, hard
rules (no React Flow patterns), a current `fConnector` setup, the choice between classic
app-owned records and opt-in `withFlowState()` managed records, and a checklist of common
silent failures. Domain validation, permissions, and persistence remain application
concerns in both state modes.

Additional references:

- Complete LLM-readable API reference: https://flow.foblex.com/llms-full.txt
- Docs index for agents: https://flow.foblex.com/llms.txt
- Diagnostic codes (`FFxxxx` console warnings/errors): https://flow.foblex.com/docs/errors
- Styling rules: `node_modules/@foblex/flow/STYLING.md`

<!-- END:foblex-flow-agent-rules -->
