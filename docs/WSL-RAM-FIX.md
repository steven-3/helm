# WSL RAM Fix — do this later

## The problem
`.wslconfig` capped WSL at **16GB** despite having **64GB RAM**. WSL maxed the 16GB ceiling → spilled to swap → swap thrashing = computer "gets fucked up" during intense Claude sessions. NOT Warp, NOT WSL being greedy — the cap was starving it (using only 25% of RAM).

Diagnosed 2026-07-12: `free -h` showed 15Gi total / 259Mi free / 3.9Gi swap in use, with 8 claude procs + live ugrep searches hitting the ceiling.

## The fix
Edit `C:\Users\<you>\.wslconfig` (Windows side) to:

```ini
[wsl2]
# 24 cores total -> 18 to WSL, 6 left for Windows
processors=18

# 64GB total -> 44GB to WSL (was 16 — THE fix), 20GB for Windows
memory=44GB

# Return unused cache to Windows over time
autoMemoryReclaim=gradual

# Bigger swap safety net under pressure
swap=16GB

# Let the page cache shrink so WSL doesn't stay inflated
sparseVhd=true
```

Changes from current: `memory` 16→**44GB**, `processors` 12→**18**, `swap` 8→**16GB**. Rest unchanged.

## Apply
1. Save the file (Windows side). Open it fast from a WSL prompt with:
   `! cmd.exe /c notepad "%USERPROFILE%\.wslconfig"`
2. In Windows PowerShell: `wsl --shutdown` — **closes ALL WSL first; save work in every terminal + Claude session.**
3. Reopen terminal. Verify: `free -h` shows ~44Gi total.

## After the fix — leftover suspects
- **Warp** is genuinely heavy (Electron, per-tab overhead) but that's WINDOWS-side RAM, separate from the WSL cap you were hitting. 20GB reserved for Windows now gives it room. helm (Tauri) replacing Warp later = lighter still.
- `autoMemoryReclaim=gradual` stays — cap was the problem, not reclaim. Switch to `dropcache` only if Windows still feels starved after raising the cap (slightly slower WSL file ops).
- 8 parallel claude procs (~400-500MB each) genuinely add up; 44GB gives headroom for many.
