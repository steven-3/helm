# Helm OSC 133 shell integration for bash/zsh.
# Opt in from your rc file:
#   source /path/to/helm/shim/helm-shell-integration.sh
# Safe to source more than once.

# Only activate inside a Helm pane (HELM=1 travels into WSL via WSLENV). The
# rc file is shared with every terminal on the machine — outside Helm this
# must be a silent no-op, not a stream of OSC 133 marks.
if [ -z "${HELM:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

if [ -n "${HELM_SHELL_INTEGRATION_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
export HELM_SHELL_INTEGRATION_LOADED=1

__helm_osc133() {
  printf '\033]133;%s\007' "$1"
}

__helm_command_active=0
__helm_precmd() {
  local exit_code=$?
  if [ "$__helm_command_active" = 1 ]; then
    __helm_osc133 "D;$exit_code"
  fi
  __helm_command_active=0
  __helm_osc133 A
}

__helm_preexec() {
  [ "$__helm_command_active" = 1 ] && return
  case "${BASH_COMMAND:-}" in
    __helm_precmd*|__helm_preexec*|__helm_osc133*) return ;;
  esac
  __helm_command_active=1
  __helm_osc133 C
}

if [ -n "${BASH_VERSION:-}" ]; then
  case ";${PROMPT_COMMAND:-};" in
    *";__helm_precmd;"*) ;;
    *) PROMPT_COMMAND="__helm_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac
  case "$PS1" in
    *"]133;B"*) ;;
    *) PS1="${PS1}\\[\033]133;B\007\\]" ;;
  esac
  trap '__helm_preexec' DEBUG
elif [ -n "${ZSH_VERSION:-}" ]; then
  autoload -Uz add-zsh-hook
  __helm_zsh_precmd() { __helm_precmd; }
  __helm_zsh_preexec() { __helm_command_active=1; __helm_osc133 C; }
  add-zsh-hook precmd __helm_zsh_precmd
  add-zsh-hook preexec __helm_zsh_preexec
  case "$PS1" in
    *"]133;B"*) ;;
    *) PS1="${PS1}%{\033]133;B\007%}" ;;
  esac
fi
