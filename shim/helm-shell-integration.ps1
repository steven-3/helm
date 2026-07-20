# Helm OSC 133 integration for PowerShell.
# Opt in from your profile:
#   . C:\path\to\helm\shim\helm-shell-integration.ps1

# Only activate inside a Helm pane — $PROFILE is shared with every PowerShell
# session on the machine; outside Helm this stays a silent no-op.
if (-not $env:HELM) { return }
if ($global:HelmShellIntegrationLoaded) { return }
$global:HelmShellIntegrationLoaded = $true
$global:HelmCommandActive = $false
$global:HelmPreviousPrompt = if (Test-Path Function:\prompt) { ${function:prompt} } else { { "PS $($executionContext.SessionState.Path.CurrentLocation)> " } }

function global:prompt {
    $exitCode = if ($global:LASTEXITCODE -is [int]) { $global:LASTEXITCODE } elseif ($?) { 0 } else { 1 }
    if ($global:HelmCommandActive) {
        [Console]::Write("`e]133;D;$exitCode`a")
    }
    [Console]::Write("`e]133;A`a")
    $text = & $global:HelmPreviousPrompt
    [Console]::Write($text)
    [Console]::Write("`e]133;B`a")
    $global:HelmCommandActive = $true
    return ""
}
