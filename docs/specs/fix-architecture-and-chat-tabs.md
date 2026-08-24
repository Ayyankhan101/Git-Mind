# Spec: Fix Architecture Tab and Chat Tab Bugs

## Problem Statement

Users report two issues with the Git-Mind application:
1. **Architecture tab blank**: The architecture tab shows no data when viewing repository analysis
2. **Chat tab not working**: The chat functionality fails to respond to user messages

These bugs prevent users from accessing key features of the application.

## Solution

1. **Architecture tab fix**: Ensure `architecture_graph` is included in the public API response by adding it to `ALL_PUBLIC_KEYS` in `routes/analysis.py`
2. **Chat tab fix**: Investigate and fix the chat endpoint to properly handle user messages

## User Stories

1. As a repository analyst, I want to view the architecture graph in the architecture tab, so that I can understand the codebase structure
2. As a repository analyst, I want to see the architecture diagram rendered correctly, so that I can visualize module relationships
3. As a repository analyst, I want to interact with the chatbot to ask questions about the codebase, so that I can get quick answers
4. As a repository analyst, I want the chat to use the architecture context, so that it can answer questions about code structure
5. As a repository analyst, I want the chat to use the RAG pipeline, so that it can search through the codebase
6. As a repository analyst, I want the chat to handle errors gracefully, so that I get informative error messages
7. As a repository analyst, I want the chat to work after analysis completes, so that I can explore the codebase interactively
8. As a repository analyst, I want the architecture graph to include nodes and edges, so that I can see module dependencies
9. As a repository analyst, I want the architecture graph to be persisted in the session, so that it's available for chat context
10. As a repository analyst, I want the chat to access the architecture graph from the session, so that it can answer architecture questions
11. As a repository analyst, I want the chat to use ChromaDB for vector search, so that it can find relevant code snippets
12. As a repository analyst, I want the chat to handle ChromaDB failures gracefully, so that the app doesn't crash
13. As a repository analyst, I want the chat to stream responses, so that I see answers in real-time
14. As a repository analyst, I want the chat to maintain conversation history, so that I can ask follow-up questions
15. As a repository analyst, I want the chat to validate session IDs, so that I can't access other users' sessions

## Implementation Decisions

### Architecture Tab Fix
- Add `architecture_graph` to `_EXTRA_PUBLIC_KEYS` in `routes/analysis.py`
- The fix is already implemented in ADR-0002
- Verify the fix by checking the API response includes `architecture_graph`

### Chat Tab Investigation
- Trace the data flow from chat request to response
- Check if `chroma_collection_name` is being stored correctly in the session
- Check if the RAG setup is completing successfully
- Check if the chat endpoint is receiving the correct parameters

### Session Persistence
- Sessions are stored in Redis with 1-hour TTL
- `chroma_collection_name` is an internal field (not exposed via public API)
- The chat endpoint reads it directly from the session, not from the public API

### Chat Endpoint Flow
1. Validate session ID format
2. Check rate limits
3. Retrieve session from Redis
4. Check if `chroma_collection_name` exists
5. Build architecture context from session
6. Call chat agent with user message, history, collection name, and context
7. Stream response back to client

## Testing Decisions

### What Makes a Good Test
- Test external behavior, not implementation details
- Test error conditions and edge cases
- Test that fixes actually resolve the reported issues

### Modules to Test
- `backend/routes/analysis.py` - Verify `architecture_graph` is in public response
- `backend/routes/chat.py` - Verify chat works with valid session
- `backend/services/session.py` - Verify session persistence works

### Prior Art
- Existing tests in `tests/test_analysis_hybrid.py` verify public field filtering
- Existing tests in `tests/test_session.py` verify session storage

## Out of Scope

- Frontend UI changes (assuming the frontend is correct)
- ChromaDB infrastructure changes
- Performance optimization
- New chat features

## Further Notes

The architecture tab fix is already implemented in ADR-0002. The chat tab issue needs further investigation to determine if it's related to the session persistence or the RAG setup.

## Spec Source

This spec was synthesized from:
- Known bugs in `.opencode/context.md`
- Code analysis of `routes/analysis.py` and `routes/chat.py`
- Session persistence flow in `services/session.py`
- ADR-0002 implementation in `state.py`
