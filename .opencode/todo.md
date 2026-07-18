# Mission: Fix Chat Output Formatting

## M1: Install Markdown Dependencies | status: pending

### T1.1: Add npm packages | agent:Worker

- [ ] S1.1.1: Install react-markdown, remark-gfm, react-syntax-highlighter | size:S
- [ ] S1.1.2: Verify packages installed without errors | size:S

## M2: Create Markdown Chat Renderer Component | status: pending | depends:M1

### T2.1: Build reusable MarkdownMessage component | agent:Worker

- [ ] S2.1.1: Create frontend/src/components/MarkdownMessage.jsx | size:M
- [ ] S2.1.2: Configure react-markdown with remark-gfm for tables/lists/strikethrough | size:S
- [ ] S2.1.3: Add syntax highlighting for code blocks with react-syntax-highlighter | size:S
- [ ] S2.1.4: Style inline code, blockquotes, links within messages | size:S

## M3: Add Markdown CSS Styles | status: pending | depends:M1

### T3.1: Add CSS for markdown elements in chat | agent:Worker

- [ ] S3.1.1: Add styles for pre/code blocks (background, border, overflow, copy button) | size:M
- [ ] S3.1.2: Add styles for ul/ol lists, blockquotes, tables, headings | size:S
- [ ] S3.1.3: Add styles for links, strong, em inside chat messages | size:S
- [ ] S3.1.4: Add visual container (background/border/padding) for assistant messages | size:S

## M4: Integrate into ChatTab | status: pending | depends:T2.1,T3.1

### T4.1: Update ChatTab to render markdown | agent:Worker

- [ ] S4.1.1: Replace {msg.content} with MarkdownMessage in ChatTab.jsx Message component | size:S
- [ ] S4.1.2: Fix or remove dead sources callback in postChatStream | size:S
- [ ] S4.1.3: Verify streaming still works with markdown rendering | size:S

## M5: Integrate into NodePanel | status: pending | depends:T2.1,T3.1

### T5.1: Update NodePanel to render markdown | agent:Worker

- [ ] S5.1.1: Replace {msg.content} with MarkdownMessage in NodePanel.jsx ChatMessage | size:S
- [ ] S5.1.2: Replace {desc} with MarkdownMessage for auto-descriptions | size:S
- [ ] S5.1.3: Remove whiteSpace: pre-wrap inline style (handled by markdown renderer) | size:S

## M6: Verification | status: pending | depends:M4,M5

### T6.1: Full system verification | agent:Reviewer

- [ ] S6.1.1: Build frontend without errors | size:S
- [ ] S6.1.2: Run existing tests (ChatTab.test.jsx) and fix any failures | size:M
- [ ] S6.1.3: LSP diagnostics clean on all modified files | size:S
- [ ] S6.1.4: Manual verification: markdown renders correctly in both chat and node panel | size:S
