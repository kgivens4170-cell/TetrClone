# Token-saving rules

- For big reads (large files, long logs/test output, broad searches), delegate to the cheap haiku helpers in `.claude/agents/`: `file-reader`, `log-digester`, `search-summarizer`. Ask for short summaries only.
- Keep replies short and direct. No restating the question, no long recaps, no unrequested explanations.
- Don't take screenshots unless asked. When needed, use a small viewport, scale 1, and crop to the relevant area. Prefer text/DOM checks over images.
- Read only the file ranges you need; avoid re-reading files already in context.
