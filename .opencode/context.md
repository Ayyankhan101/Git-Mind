# Project Context

## Environment

- Language: JavaScript (React 19) + Python (FastAPI backend)
- Runtime: Node.js (CRA with react-app-rewired)
- Build: `react-app-rewired build`
- Test: `react-scripts test`
- Package Manager: npm
- CSS: Tailwind CSS v4 + custom CSS variables (index.css)
- LLM: Groq (llama-3.3-70b-versatile) via langchain_groq
- Vector DB: ChromaDB for RAG

## Project Type

- [x] Application (Web) — React SPA + FastAPI backend
- Monorepo: frontend/ + backend/ + gitmind-backend-space/ (backup)

## Structure

- Source (FE): `frontend/src/components/`, `frontend/src/api.js`
- Source (BE): `backend/routes/chat.py`, `backend/agents/chat.py`
- CSS: `frontend/src/index.css` (5588 lines, single CSS file)
- No markdown rendering library installed

## Conventions

- Components: JSX functional components with hooks
- State: useState/useRef, no Redux
- Styling: CSS classes + inline styles
- Streaming: SSE via `postChatStream` in api.js

---

## CRITICAL FINDING: Chat Output Formatting Bug

### Problem

The user reports: "the output in the node chat and in the chat tab is not in a properly and easy to understand format."

### Root Cause

**Both ChatTab and NodePanel render `msg.content` as raw React text — NO markdown parsing.**

The LLM is instructed to produce markdown (system prompt says "Use markdown for code blocks and lists"), but the frontend never parses it.

### Files Involved

| File                                    | Role             | Issue                                                                             |
| --------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `frontend/src/components/ChatTab.jsx`   | Chat tab UI      | Line 37: `{msg.content}` — raw text                                               |
| `frontend/src/components/NodePanel.jsx` | Node click panel | Line 42: `{msg.content}` — raw text                                               |
| `frontend/src/api.js`                   | API client       | Line 235: `postChatStream` only accepts 4 params (no sources callback)            |
| `backend/agents/chat.py`                | LLM agent        | System prompt instructs markdown, but no source citation extraction               |
| `backend/routes/chat.py`                | Chat endpoint    | SSE only sends `{"token": "..."}` — no source metadata                            |
| `frontend/src/index.css`                | Styles           | No CSS for `pre`, `code` blocks, `ul`/`ol`, `blockquote`, `table` in chat context |
| `frontend/package.json`                 | Dependencies     | No `react-markdown`, `remark`, `rehype`, or `react-syntax-highlighter`            |

### Specific Issues

1. **No markdown rendering library** — react-markdown, remark-gfm, rehype-highlight not installed
2. **No CSS for markdown elements** — code blocks, lists, blockquotes, tables, headings have no styling
3. **Dead sources callback** — ChatTab passes 5th arg to postChatStream but api.js ignores it
4. **Assistant messages have no visual container** — `.chat-msg.assistant` has no background/border/pending
5. **Backend sends no source metadata** — only raw tokens, no file citations
6. **NodePanel description is also raw text** — auto-descriptions render markdown as plain text

### What LLM Outputs (Example)

````markdown
The authentication works as follows:

- JWT tokens are validated in `auth/middleware.py` line 42
- Here is a code example:
  \```python
  def validate(token):
  return jwt.decode(token, SECRET)
  \```
````

### What User Sees

A single blob of text with raw `#`, `-`, ` ``` `, backticks, etc. — completely unreadable.

### Fix Plan

1. Install `react-markdown` + `remark-gfm` + `react-syntax-highlighter`
2. Replace `{msg.content}` with `<ReactMarkdown>` in both ChatTab and NodePanel
3. Add CSS for markdown elements inside chat containers
4. Fix postChatStream to accept sources callback OR remove dead code
5. Add visual container styling for assistant messages
6. Optionally: extract source citations from LLM response text on backend
