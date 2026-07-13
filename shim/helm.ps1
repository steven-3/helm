param(
    [Parameter(Position = 0)]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Remaining
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($null -eq $Remaining) {
    $Remaining = @()
}

function Show-Usage {
    [Console]::Error.WriteLine("Usage:")
    [Console]::Error.WriteLine("  helm copy [--label LABEL] <text|->")
    [Console]::Error.WriteLine("  helm link <url> [label]")
    [Console]::Error.WriteLine("  helm img <path> [--b64]")
    [Console]::Error.WriteLine("  helm widget <json|file|->")
}

function Fail([string]$Message) {
    [Console]::Error.WriteLine("helm: $Message")
    exit 2
}

function Emit-Osc([object]$Payload, [string]$Fallback) {
    if (-not (Test-Path Env:HELM)) {
        [Console]::Out.WriteLine($Fallback)
        return
    }

    $json = $Payload | ConvertTo-Json -Compress -Depth 10
    [Console]::Out.Write("$([char]27)]5379;$json$([char]7)")
}

function Read-TextSource([string]$Source) {
    if ($Source -eq "-") {
        return [Console]::In.ReadToEnd()
    }
    if (Test-Path -LiteralPath $Source -PathType Leaf) {
        return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Source).ProviderPath)
    }
    return $Source
}

try {
    if ([string]::IsNullOrEmpty($Command)) {
        Show-Usage
        exit 2
    }

    switch ($Command.ToLowerInvariant()) {
        "copy" {
            $label = $null
            $positionals = [Collections.Generic.List[string]]::new()
            for ($index = 0; $index -lt $Remaining.Count; $index++) {
                $argument = $Remaining[$index]
                if ($argument -eq "--label") {
                    if ($index + 1 -ge $Remaining.Count) {
                        Fail "--label requires a value"
                    }
                    $index++
                    $label = $Remaining[$index]
                }
                elseif ($argument.StartsWith("--label=")) {
                    $label = $argument.Substring(8)
                }
                elseif ($argument -eq "--") {
                    for ($index++; $index -lt $Remaining.Count; $index++) {
                        $positionals.Add($Remaining[$index])
                    }
                    break
                }
                elseif ($argument.StartsWith("-") -and $argument -ne "-") {
                    Fail "unknown copy option: $argument"
                }
                else {
                    $positionals.Add($argument)
                }
            }

            if ($positionals.Count -ne 1) {
                Fail "copy requires exactly one text argument or -"
            }
            $text = if ($positionals[0] -eq "-") {
                [Console]::In.ReadToEnd()
            }
            else {
                $positionals[0]
            }
            $payload = [ordered]@{ v = 1; t = "copy"; text = $text }
            if ($null -ne $label) {
                $payload.label = $label
            }
            Emit-Osc $payload $text
            break
        }

        "link" {
            if ($Remaining.Count -lt 1 -or $Remaining.Count -gt 2) {
                Fail "link requires a URL and optional label"
            }
            $url = $Remaining[0]
            $payload = [ordered]@{ v = 1; t = "link"; url = $url }
            $fallback = $url
            if ($Remaining.Count -eq 2) {
                $label = $Remaining[1]
                $payload.label = $label
                if (-not [string]::IsNullOrEmpty($label)) {
                    $fallback = "${label}: $url"
                }
            }
            Emit-Osc $payload $fallback
            break
        }

        "img" {
            $useBase64 = $false
            $path = $null
            foreach ($argument in $Remaining) {
                if ($argument -eq "--b64") {
                    $useBase64 = $true
                }
                elseif ($argument.StartsWith("-") -and $argument -ne "-") {
                    Fail "unknown img option: $argument"
                }
                elseif ($null -ne $path) {
                    Fail "img requires exactly one path"
                }
                else {
                    $path = $argument
                }
            }
            if ([string]::IsNullOrEmpty($path)) {
                Fail "img requires a path"
            }

            if (-not (Test-Path Env:HELM)) {
                [Console]::Out.WriteLine($path)
                break
            }

            if ($useBase64) {
                $bytes = if ($path -eq "-") {
                    $memory = [IO.MemoryStream]::new()
                    [Console]::OpenStandardInput().CopyTo($memory)
                    $memory.ToArray()
                }
                else {
                    [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $path).ProviderPath)
                }
                Emit-Osc ([ordered]@{
                        v   = 1
                        t   = "img"
                        b64 = [Convert]::ToBase64String($bytes)
                    }) $path
            }
            else {
                Emit-Osc ([ordered]@{ v = 1; t = "img"; path = $path }) $path
            }
            break
        }

        "widget" {
            if ($Remaining.Count -ne 1) {
                Fail "widget requires exactly one JSON/HTML value, file, or -"
            }
            $html = Read-TextSource $Remaining[0]
            Emit-Osc ([ordered]@{ v = 1; t = "widget"; html = $html }) $html
            break
        }

        { $_ -in @("help", "-h", "--help") } {
            Show-Usage
            break
        }

        default {
            Show-Usage
            Fail "unknown subcommand: $Command"
        }
    }
}
catch {
    [Console]::Error.WriteLine("helm: $($_.Exception.Message)")
    exit 1
}
