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
