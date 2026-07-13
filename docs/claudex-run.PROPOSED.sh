#!/usr/bin/env bash
# claudex-run [--main-model MODEL] [--subagent-model MODEL] [--subagent-effort LEVEL] [claude args...]
#
# Claude Code UI, main model routed through CLIProxyAPI. Now supports FLIPPING the
# brain: main can be GPT (gpt-5.6-sol) or Claude (claude-opus-4-8), and subagents
# can be either — any combination.
#
# /effort in-session controls BOTH the orchestrator and the subagent model
# (Claude Code sends the same effort to every request):
#   - sol/gpt-*  -> reasoning.effort      (codex protocol, passes through the proxy)
#   - claude-*   -> output_config.effort  (forwarded to Anthropic as-is)
#
# Options:
#   --main-model MODEL        default gpt-5.6-sol. Set claude-opus-4-8 to FLIP the
#                             brain to Opus (Opus plans, subagents implement).
#   --subagent-model MODEL    default = same as main. Set independently to mix.
#   --subagent-effort LEVEL   PIN the subagent model to a fixed effort, overriding
#                             /effort for that model only. low|medium|high|xhigh|max.
set -euo pipefail
BASE="$HOME/.cli-proxy-api/config.base.yaml"
CFG="$HOME/.cli-proxy-api/config.yaml"
KEYF="$HOME/.cli-proxy-api/.frontkey.full"
RUNHASH_F="$HOME/.cli-proxy-api/.running.hash"
PORT=8317
LOG="$HOME/.cli-proxy-api/proxy.log"
MAIN_MODEL="gpt-5.6-sol"
SUBAGENT_MODEL=""          # empty => default to MAIN_MODEL after parsing
SUBAGENT_EFFORT=""

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --main-model)      MAIN_MODEL="$2"; shift 2 ;;
    --subagent-model)  SUBAGENT_MODEL="$2"; shift 2 ;;
    --subagent-effort) SUBAGENT_EFFORT="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

# Subagent defaults to the main model unless explicitly set.
[[ -z "$SUBAGENT_MODEL" ]] && SUBAGENT_MODEL="$MAIN_MODEL"

[[ -f "$KEYF" ]] || { echo "claudex: missing front key ($KEYF)"; exit 1; }
[[ -f "$BASE" ]] || { echo "claudex: missing base config ($BASE)"; exit 1; }
FRONTKEY="$(cat "$KEYF")"

if [[ -n "$SUBAGENT_EFFORT" ]]; then
  case "$SUBAGENT_EFFORT" in
    low|medium|high|xhigh|max) : ;;
    *) echo "claudex: invalid --subagent-effort '$SUBAGENT_EFFORT' (valid: low medium high xhigh max)"; exit 1 ;;
  esac
fi

# Render config.yaml from base (+ optional backend-aware subagent effort override).
render_config() {
  cp "$BASE" "$CFG"
  [[ -z "$SUBAGENT_EFFORT" ]] && return 0
  if [[ "$SUBAGENT_MODEL" == claude-* ]]; then
    cat >> "$CFG" <<EOF
  override:
    - models:
        - name: "${SUBAGENT_MODEL}"
          protocol: "claude"
      params:
        "output_config.effort": "${SUBAGENT_EFFORT}"
EOF
  else
    cat >> "$CFG" <<EOF
  override:
    - models:
        - name: "${SUBAGENT_MODEL}"
          protocol: "codex"
      params:
        "reasoning.effort": "${SUBAGENT_EFFORT}"
EOF
  fi
}

ready() { curl -fsS -m 2 "http://127.0.0.1:${PORT}/v1/models" -H "Authorization: Bearer ${FRONTKEY}" >/dev/null 2>&1; }
proxy_pid() { ss -ltnp 2>/dev/null | grep ":${PORT}" | grep -oP 'pid=\K[0-9]+' | head -1; }

render_config
DESIRED_HASH="$(sha256sum "$CFG" | cut -d' ' -f1)"
CUR_HASH="$(cat "$RUNHASH_F" 2>/dev/null || echo none)"

start_proxy() {
  setsid "$HOME/.local/bin/cli-proxy-api" -config "$CFG" >>"$LOG" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  for _ in $(seq 1 24); do ready && break; sleep 0.5; done
  ready || { echo "claudex: proxy did not become ready — check $LOG"; exit 1; }
  echo "$DESIRED_HASH" > "$RUNHASH_F"
}

if ! ready; then
  echo "claudex: starting proxy (main=${MAIN_MODEL}, subagent=${SUBAGENT_MODEL}, effort-pin=${SUBAGENT_EFFORT:-none})"
  start_proxy
elif [[ "$CUR_HASH" != "$DESIRED_HASH" ]]; then
  echo "claudex: config changed (effort-pin=${SUBAGENT_EFFORT:-none}) — restarting proxy"
  P="$(proxy_pid)"; [[ -n "$P" ]] && kill "$P" 2>/dev/null || true
  sleep 1
  start_proxy
fi

export ANTHROPIC_BASE_URL="http://127.0.0.1:${PORT}"
export ANTHROPIC_AUTH_TOKEN="${FRONTKEY}"
export CLAUDE_CODE_SUBAGENT_MODEL="${SUBAGENT_MODEL}"
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1
export CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=3
export ENABLE_TOOL_SEARCH=false
exec claude --model "${MAIN_MODEL}" "$@"
