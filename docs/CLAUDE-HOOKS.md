# Claude Code hook bridge

helm can surface files changed by Claude Code as Stage cards. A `PostToolUse` hook sends image writes and edits to an image card, and other changed paths to a copy card labeled `edited`.

Add this to `~/.claude/settings.json` or the project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Write|Edit",
        "hooks": [ { "type": "command", "command": "helm hook", "async": true, "timeout": 10 } ] }
    ]
  }
}
```

`helm` must be on `PATH`; panes launched by helm inject the shim automatically. Outside a helm pane, `HELM` is unset and `helm hook` exits successfully without producing output, so the hook is a silent no-op.

To test the terminal bridge manually from a helm pane:

```sh
printf '\033]777;helm;{"v":1,"t":"copy","text":"hi"}\007'
```

A copy card containing `hi` should appear on the Stage.

## MCP return channel

Register helm's MCP server with Claude Code:

```sh
claude mcp add helm -- helm mcp
```

Or add it directly to Claude Code settings:

```json
{
  "mcpServers": {
    "helm": {
      "command": "helm",
      "args": ["mcp"]
    }
  }
}
```

The zero-dependency Node server exposes these tools:

- `helm_copy` — surface copyable text.
- `helm_show_link` — surface a clickable link.
- `helm_show_image` — surface an image from a local path.
- `helm_show` — surface a table, JSON, Markdown, or diff.
- `helm_progress` — surface or update progress.
- `helm_confirm` — ask for confirmation and return the selected response.
- `helm_choose` — ask the user to choose from supplied options.
- `helm_ask` — ask the user for text.

`helm_confirm`, `helm_choose`, and `helm_ask` block until the user answers in the Stage. The bridge times out after 300 seconds and returns a tool error if no answer arrives. Display-only tools return as soon as the Stage accepts them.
