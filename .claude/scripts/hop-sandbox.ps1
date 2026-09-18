<#
.SYNOPSIS
  Recreate or refresh the 55candles sandbox without losing conversation history.

.DESCRIPTION
  `sbx refresh` only refreshes proxy-injected credentials; it does not re-run your
  --kit, so the STS token copied into the sandbox at create time goes stale and
  Bedrock starts returning ExpiredTokenException. And ~/.claude/projects lives on a
  sandbox-local ext4 volume (confirmed: /dev/vde), so `sbx rm` deletes every
  transcript AND the agent's memory directory under
  ~/.claude/projects/-d-Repos-55candles/memory.

  Both problems are solved by staging state in .claude-history/ at the repo root,
  which is a live two-way virtiofs mount into the sandbox (host[/d/Repos/55candles]).
  The sandbox half of that contract is .claude/scripts/history-sync.sh, wired to
  SessionStart/Stop/SessionEnd hooks in .claude/settings.json.

.EXAMPLE
  .\.claude\scripts\hop-sandbox.ps1 -Refresh
  # Mint a fresh token and push it into the RUNNING sandbox. No recreate, history intact.

.EXAMPLE
  .\.claude\scripts\hop-sandbox.ps1 -Recreate
  # Full rm + create + run. History is restored automatically by the SessionStart hook.

.EXAMPLE
  .\.claude\scripts\hop-sandbox.ps1 -RepairNow
  # Just fix the Docker prerequisites (CCleaner + services) and exit. Mints nothing.
#>
[CmdletBinding(DefaultParameterSetName = 'Refresh')]
param(
  [Parameter(ParameterSetName = 'Refresh')][switch]$Refresh,
  [Parameter(ParameterSetName = 'Recreate')][switch]$Recreate,
  # Run the prerequisite repair on its own and stop. Nothing is minted, no sandbox
  # is touched -- for when you know the services are down and just want them back.
  [Parameter(ParameterSetName = 'RepairNow')][switch]$RepairNow,
  # `sbx ls` name of this project's sandbox, i.e. $SANDBOX_VM_ID inside it.
  [string]$Name       = 'claude-55candles',
  # Repo root: this script lives in <repo>\.claude\scripts, so '..\..' is the
  # workspace path you would hand to `sbx create`.
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$BedrockPs1 = (Join-Path $HOME '.aws\bedrock.ps1'),
  [string]$Kit        = (Join-Path $HOME '.aws\bedrock-kit'),
  # Explicit path to the AWS credentials file inside the kit. Leave empty to
  # auto-detect (searches $Kit for a file holding aws_access_key_id + session token).
  [string]$CredentialFile = '',
  # Skip the auto-repair and fail with the old manual instructions instead. Use if
  # you would rather see the breakage than have the script elevate and fix it.
  [switch]$NoRepair
)

$ErrorActionPreference = 'Stop'
# Staging area on the virtiofs mount. Holds the mirrored transcripts/memory and the
# freshly minted aws-credentials file. Gitignored -- it contains a live STS token.
# Keep this path in sync with STORE in .claude/scripts/history-sync.sh.
$Store = Join-Path $ProjectDir '.claude-history'

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok  ($m) { Write-Host "    $m" -ForegroundColor Green }

# Run a native command and return its exit code without letting stderr trip
# $ErrorActionPreference='Stop'. In Windows PowerShell a native command's stderr
# becomes an ErrorRecord, which would abort the script on a *diagnostic* — the
# opposite of what a preflight check is for.
function Invoke-ExitCode {
  param([scriptblock]$Command)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command 2>$null | Out-Null; return $LASTEXITCODE }
  finally { $ErrorActionPreference = $prev }
}

# D:\Repos\55candles -> /d/Repos/55candles, which is where the workspace is mounted
# inside the sandbox (`findmnt` shows host[/d/Repos/55candles] on that exact path).
# Derived rather than hardcoded so the script keeps working if the repo moves.
function Convert-ToSandboxPath {
  param([string]$HostPath)
  $p = $HostPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(/.*)$') {
    return "/$($Matches[1].ToLowerInvariant())$($Matches[2])"
  }
  return $p
}

# Run history-sync.sh inside the sandbox. Returns $true on success.
#
# This sbx build rejects `exec --name` (the name is positional, matching the
# `sbx run claude .` form bedrock.ps1 prints). The exact spelling varies between
# builds and isn't publicly documented, so try the plausible forms in order and
# report which one worked. `cd` first because exec's working directory is not
# guaranteed to be the workspace.
function Invoke-InSandbox {
  param(
    [Parameter(Mandatory)][string]$SandboxName,
    [Parameter(Mandatory)][string]$Verb
  )

  $wd    = Convert-ToSandboxPath $ProjectDir
  $inner = "cd '$wd' && bash .claude/scripts/history-sync.sh $Verb"
  $attempts = @(
    @('exec', $SandboxName, '--', 'bash', '-lc', $inner),
    @('exec', '--sandbox', $SandboxName, '--', 'bash', '-lc', $inner),
    @('run',  '--name', $SandboxName, '--', 'bash', '-lc', $inner)
  )

  foreach ($a in $attempts) {
    # `2>&1` on a native exe is a trap in Windows PowerShell: each stderr line
    # comes back as an ErrorRecord, which under $ErrorActionPreference='Stop'
    # ABORTS the script — even when the command exited 0. history-sync.sh writes
    # its progress line ("installed fresh AWS credentials") to stderr, so a
    # perfectly successful refresh was killing the script right before it printed
    # "Done", and surfacing as a red NativeCommandError.
    #
    # We still want the merged output (the retry logic below greps it for syntax
    # rejections), so keep 2>&1 and make it non-fatal for the duration of the call.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    # .ToString() on each item, NOT Out-String: 2>&1 turns stderr lines into
    # ErrorRecords, and Out-String renders those with the full "At line:N char:M"
    # decoration. We want the text the command actually wrote.
    try { $out = ((& sbx @a 2>&1) | ForEach-Object { $_.ToString() }) -join "`n" }
    finally { $ErrorActionPreference = $prev }

    if ($LASTEXITCODE -eq 0) {
      # Anything the inner script reported (including its stderr progress line)
      # is worth showing — it is the only confirmation the work happened.
      if ($out.Trim()) { Write-Ok $out.Trim() }
      Write-Ok "worked: sbx $($a -join ' ')"
      return $true
    }
    # Only keep trying while the CLI is rejecting our syntax; a real failure
    # (sandbox not running, script error) should surface rather than be retried.
    if ($out -notmatch 'unknown flag|unknown command|unknown shorthand|Usage:') {
      Write-Host $out.TrimEnd()
      break
    }
  }
  return $false
}

# ---- Docker prerequisite repair ---------------------------------------------
#
# WHY THIS EXISTS
#
# CCleaner's "Program Deactivator" repeatedly sets WslService and com.docker.service
# to Disabled, which kills the Docker engine. It is not a theory: CCleaner's own
# database records the disables, and the timestamps match the System event log
# (ID 7040) to the second --
#
#     C:\ProgramData\Piriform\CCleaner\CCleanerProgramDeactivator.db
#     service:com.docker.service  2026-08-13 02:29:54  origStartType:3 origState:1
#     service:WSLService          2026-08-13 11:03:26  origStartType:2 origState:4
#
# On 2026-08-13 the services were repaired at 10:29 and CCleaner had disabled them
# again by 11:03 -- 34 minutes. So repairing the services without stopping the
# deactivator just buys half an hour. Both halves are done together here.
#
# One earlier diagnosis blamed Windows Update, because the 02:29:54 disable landed
# two seconds after MoUsoCoreWorker.exe triggered a restart for KB5121003. That was
# a coincidence. Check the Piriform DB before blaming the OS.

$OptimizerService = 'CCleanerPerformanceOptimizerService'

function Test-Elevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Read-only survey of what is wrong. Deliberately needs NO elevation, so the healthy
# path never triggers a UAC prompt just to find out that nothing is broken.
function Get-DockerBlocker {
  $svc = @()
  foreach ($n in 'WslService', 'com.docker.service') {
    $s = Get-Service -Name $n -ErrorAction SilentlyContinue
    if (-not $s) { continue }
    # StartType Disabled is the CCleaner signature; Stopped alone is enough to
    # block the engine even when the start type is fine.
    if ($s.StartType -eq 'Disabled' -or $s.Status -ne 'Running') {
      $svc += [pscustomobject]@{ Name = $n; Status = $s.Status; StartType = $s.StartType }
    }
  }
  $opt = Get-Service -Name $OptimizerService -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    Services       = $svc
    Optimizer      = $opt
    OptimizerArmed = ($null -ne $opt -and ($opt.Status -eq 'Running' -or $opt.StartType -ne 'Disabled'))
  }
}

# The privileged half. Runs in a child process via UAC because service start types
# cannot be changed from a normal shell. Docker Desktop itself is deliberately NOT
# started here -- it must run as the logged-in user, not as Administrator.
# Split out from Invoke-ElevatedRepair so the generated script can be inspected
# without actually elevating -- the optimizer branch is otherwise only reachable on
# a machine where CCleaner is currently armed, which is exactly when you do not
# want to be finding out that a variable failed to interpolate.
function New-RepairScriptBody {
  param([switch]$StopOptimizer)

  $body = @'
$ErrorActionPreference = 'Continue'
'@
  if ($StopOptimizer) {
    $body += @"

Write-Host '==> Disabling CCleaner Program Deactivator' -ForegroundColor Cyan
Stop-Service -Name '$OptimizerService' -Force -ErrorAction SilentlyContinue
Set-Service  -Name '$OptimizerService' -StartupType Disabled -ErrorAction SilentlyContinue
# The tray app can re-arm the deactivator; it comes back when CCleaner is opened.
Get-Process CCleaner64 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
"@
  }
  $body += @'

Write-Host '==> Restoring service start types' -ForegroundColor Cyan
# Manual is WslService's correct default -- it is demand-start by design, so
# forcing it to Automatic would be wrong, not safer.
Set-Service -Name WslService         -StartupType Manual    -ErrorAction SilentlyContinue
Set-Service -Name com.docker.service -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name WslService         -ErrorAction SilentlyContinue
Start-Service -Name com.docker.service -ErrorAction SilentlyContinue

Get-Service WslService, com.docker.service | Select-Object Name, Status, StartType | Format-Table -AutoSize
'@
  return $body
}

function Invoke-ElevatedRepair {
  param([switch]$StopOptimizer)

  $body = New-RepairScriptBody -StopOptimizer:$StopOptimizer
  $tmp = Join-Path $env:TEMP ("hop-sandbox-repair-{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  Set-Content -LiteralPath $tmp -Value $body -Encoding utf8

  try {
    Write-Ok 'requesting elevation (approve the UAC prompt)'
    $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$tmp`""
    )
    return ($p.ExitCode -eq 0)
  } catch {
    # Declining the UAC prompt lands here. That is a choice, not a crash.
    Write-Warning "Elevation was declined or failed: $($_.Exception.Message)"
    return $false
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

# Bring the engine up: services first (elevated), then Docker Desktop as the user,
# then wait for the engine socket. Returns $true if `docker version` succeeds.
function Repair-DockerPrerequisites {
  param([int]$TimeoutSeconds = 180)

  $b = Get-DockerBlocker
  if ($b.Services.Count -gt 0) {
    foreach ($s in $b.Services) {
      Write-Ok ("service {0}: {1}/{2} -- needs repair" -f $s.Name, $s.Status, $s.StartType)
    }
  }
  if ($b.OptimizerArmed) {
    Write-Ok "$OptimizerService is armed -- it is what disables these services"
  }

  if ($b.Services.Count -gt 0 -or $b.OptimizerArmed) {
    if (Test-Elevated) {
      # Already elevated: do it in-process rather than spawning a pointless UAC.
      if ($b.OptimizerArmed) {
        Stop-Service -Name $OptimizerService -Force -ErrorAction SilentlyContinue
        Set-Service  -Name $OptimizerService -StartupType Disabled -ErrorAction SilentlyContinue
        Get-Process CCleaner64 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      }
      Set-Service -Name WslService         -StartupType Manual    -ErrorAction SilentlyContinue
      Set-Service -Name com.docker.service -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name WslService         -ErrorAction SilentlyContinue
      Start-Service -Name com.docker.service -ErrorAction SilentlyContinue
    } else {
      [void](Invoke-ElevatedRepair -StopOptimizer:$b.OptimizerArmed)
    }
  }

  # If the engine is already answering, stop here. -RepairNow is expected to be run
  # on a HEALTHY machine (that is the only way to disarm CCleaner before it bites),
  # and bouncing a working Docker Desktop to fix nothing would be its own bug.
  if ((Invoke-ExitCode { docker version --format '{{.Server.Version}}' }) -eq 0) {
    Write-Ok 'engine already up -- leaving Docker Desktop alone'
    return $true
  }

  # Services alone are not enough -- the engine lives in Docker Desktop. And if the
  # app is ALREADY running while the engine is down, it is wedged on the failure it
  # hit when WSL was disabled ("Docker Desktop is unable to start"); it has to be
  # restarted, not merely left open. That was the exact state on 2026-08-13.
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) {
    if (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue) {
      Write-Ok 'Docker Desktop is running but the engine is not -- restarting it'
      Get-Process 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 4
    }
    Write-Ok 'starting Docker Desktop'
    Start-Process $exe
  } else {
    Write-Warning "Docker Desktop not found at $exe"
  }

  Write-Ok "waiting up to ${TimeoutSeconds}s for the engine"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Invoke-ExitCode { docker version --format '{{.Server.Version}}' }) -eq 0) { return $true }
    Start-Sleep -Seconds 5
  }
  return $false
}

# Preflight. Everything after this — including minting a Bedrock token, which can
# open a browser and burns a ~1h credential — is wasted if sbx can't reach Docker.
#
# This exists because on 2026-08-12 both -Refresh and -Recreate minted fresh
# credentials and THEN died on a 500 from sbx, twice. The backend had been down
# the whole time; the script just found out last.
function Assert-SandboxBackend {
  Write-Step 'Checking container backend'

  if ((Invoke-ExitCode { docker version --format '{{.Server.Version}}' }) -ne 0) {
    if (-not $NoRepair) {
      Write-Step 'Docker engine is down -- attempting automatic repair'
      if (Repair-DockerPrerequisites) {
        Write-Ok 'docker engine: up (repaired)'
        if ((Invoke-ExitCode { sbx ls }) -ne 0) {
          throw 'Docker engine came back, but the sbx daemon is still unhealthy. Try: sbx daemon restart'
        }
        Write-Ok 'sbx daemon: healthy'
        return
      }
      Write-Warning 'Automatic repair did not bring the engine up.'
    }
    throw @"
Docker engine is not reachable, so sbx cannot create or inspect sandboxes.
(Nothing was minted or changed.)

Start Docker Desktop, then confirm the ENGINE — not just the app — is up:

    docker version --format "server={{.Server.Version}}"

That must print a version. If it stays blank, the WSL/Docker services are
probably disabled:

    Get-Service WslService, com.docker.service | Select-Object Name, Status, StartType

Both should be Running. To re-enable, in an ELEVATED PowerShell:

    Set-Service WslService -StartupType Manual;            Start-Service WslService
    Set-Service com.docker.service -StartupType Automatic; Start-Service com.docker.service

If they keep going Disabled, CCleaner's Program Deactivator is doing it -- check
$OptimizerService. Fix both with:

    .\.claude\scripts\hop-sandbox.ps1 -RepairNow

This script also does it automatically unless you pass -NoRepair.
"@
  }
  Write-Ok 'docker engine: up'

  # Healthy today, but CCleaner will disable these services again if its deactivator
  # is still armed -- last time that took 34 minutes. Warn without elevating: a
  # working run should never pop a UAC prompt.
  $armed = (Get-DockerBlocker).OptimizerArmed
  if ($armed) {
    Write-Warning @"
$OptimizerService is running. It is what disables WslService/com.docker.service and
kills the engine. To stop it permanently:

    .\.claude\scripts\hop-sandbox.ps1 -RepairNow
"@
  }

  if ((Invoke-ExitCode { sbx ls }) -ne 0) {
    throw @"
Docker engine is up, but the sbx daemon cannot resolve container state.
(Nothing was minted or changed.)

Try:
    sbx daemon restart

If that times out, orphaned 'containerd-shim-nerdbox-v1' processes are holding
containerd state from a previous run. When wedged they survive Stop-Process
-Force, and only a REBOOT clears them. Check with:

    Get-Process containerd-shim-nerdbox-v1 -ErrorAction SilentlyContinue
"@
  }
  Write-Ok 'sbx daemon: healthy'
}

# Does the named sandbox exist? Parsed from `sbx ls` because there is no
# machine-readable query in this build. Only used to give a better error, never
# to decide whether to destroy anything.
function Test-SandboxExists {
  param([string]$SandboxName)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = (& sbx ls 2>$null | Out-String)
    if ($LASTEXITCODE -ne 0) { return $false }
    # Anchor to the SANDBOX column. A loose \bname\b match is wrong here: the
    # listing also carries the WORKSPACE path of every sandbox, so a bare name
    # ('55candles') matches the path column of an unrelated row and the check
    # always says "exists". -match is case-insensitive too, hence the anchor.
    return ($out -match "(?m)^\s*$([regex]::Escape($SandboxName))\s")
  } finally { $ErrorActionPreference = $prev }
}

# Mint a fresh STS token and stage it on the virtiofs mount, where the sandbox can
# read it.
#
# bedrock.ps1 does NOT write ~/.aws/credentials -- it populates the kit directory
# ($Kit) and prints an expiry. The kit's internal layout isn't documented, so rather
# than hardcode a filename we search it for the file containing the STS keys. This
# keeps working if the kit layout changes.
function Find-KitCredentialFile {
  if (-not (Test-Path $Kit)) { throw "Kit directory not found at $Kit" }

  # An AWS shared-credentials file must contain both an access key id and a
  # session token (STS temporary creds). Match on that, not on a name.
  $match = Get-ChildItem -Path $Kit -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 0 -and $_.Length -lt 64KB } |
    Where-Object {
      $t = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
      $t -match 'aws_access_key_id' -and $t -match 'aws_session_token'
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $match) {
    throw @"
Could not find an AWS credentials file inside the kit: $Kit

Inspect it and tell me the layout:
    Get-ChildItem -Recurse '$Kit' | Select-Object FullName, Length
Then set -CredentialFile to the right path.
"@
  }
  return $match.FullName
}

function Update-StagedCredentials {
  Write-Step 'Minting fresh Bedrock credentials'
  if (-not (Test-Path $BedrockPs1)) { throw "bedrock.ps1 not found at $BedrockPs1" }
  & $BedrockPs1
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "bedrock.ps1 exited with code $LASTEXITCODE"
  }

  $src = if ($CredentialFile) { $CredentialFile } else { Find-KitCredentialFile }
  if (-not (Test-Path $src)) { throw "Credential file not found: $src" }
  Write-Ok "source: $src"

  # The source may be a real ini credentials file OR the kit's spec.yaml, which
  # embeds the same keys inside a YAML block scalar (indented, and followed by
  # unrelated YAML like `mode: "0600"`). So don't copy the file or parse sections:
  # pull out only the three credential keys and re-emit a clean ini.
  $wanted = 'aws_access_key_id', 'aws_secret_access_key', 'aws_session_token'
  $found  = [ordered]@{}
  foreach ($line in (Get-Content $src)) {
    # key = value | key: value, with arbitrary leading indentation.
    if ($line -match '^\s*(aws_access_key_id|aws_secret_access_key|aws_session_token)\s*[:=]\s*(.+?)\s*$') {
      $k, $v = $Matches[1], $Matches[2]
      # Strip YAML quoting/trailing comma if present; keep the first occurrence.
      $v = $v.Trim('"', "'", ',')
      if (-not $found.Contains($k) -and $v) { $found[$k] = $v }
    }
  }

  foreach ($k in 'aws_access_key_id', 'aws_secret_access_key') {
    if (-not $found.Contains($k)) { throw "Missing $k in $src" }
  }
  if (-not $found.Contains('aws_session_token')) {
    Write-Warning 'No aws_session_token found -- assuming long-lived IAM keys.'
  }

  $body = ($wanted | Where-Object { $found.Contains($_) } |
           ForEach-Object { "$_=$($found[$_])" }) -join "`n"
  $text = "[default]`n$body`n"

  New-Item -ItemType Directory -Force -Path $Store | Out-Null
  $dest = Join-Path $Store 'aws-credentials'
  # -NoNewline + UTF8 without BOM: a BOM breaks AWS ini parsing.
  [System.IO.File]::WriteAllText($dest, $text, (New-Object System.Text.UTF8Encoding $false))
  Write-Ok "staged -> $dest"
}

# ---- RepairNow path ---------------------------------------------------------
# Standalone prerequisite repair. Mints nothing and touches no sandbox, so it is
# safe to run at any time -- including when the engine is already healthy, which is
# the only way to disarm CCleaner before it breaks things again.
if ($PSCmdlet.ParameterSetName -eq 'RepairNow' -or $RepairNow) {
  Write-Step 'Repairing Docker prerequisites'
  $before = Get-DockerBlocker
  if ($before.Services.Count -eq 0 -and -not $before.OptimizerArmed) {
    Write-Ok 'Nothing to repair: services are Running and the deactivator is disabled.'
    return
  }
  if (Repair-DockerPrerequisites) {
    Write-Ok 'Docker engine is up.'
  } else {
    Write-Warning 'Engine did not come up. Open Docker Desktop and check its error dialog.'
  }
  Get-Service WslService, com.docker.service, $OptimizerService -ErrorAction SilentlyContinue |
    Select-Object Name, Status, StartType | Format-Table -AutoSize
  return
}

if ($PSCmdlet.ParameterSetName -eq 'Refresh' -or $Refresh) {
  Assert-SandboxBackend

  # -Refresh pushes a token into a RUNNING sandbox. With no sandbox there is
  # nothing to push into, and the raw failure reads like a backend fault — which
  # is exactly the wrong place to start debugging.
  if (-not (Test-SandboxExists $Name)) {
    throw @"
Sandbox '$Name' does not exist, so there is nothing to refresh.
(Nothing was minted or changed.)

Create it instead:

    .\.claude\scripts\hop-sandbox.ps1 -Recreate
"@
  }

  Update-StagedCredentials

  # Push into the running sandbox. The SessionStart hook does this too, so a plain
  # restart/resume also picks it up -- this just makes it effective immediately.
  Write-Step "Installing credentials into running sandbox '$Name'"
  if (Invoke-InSandbox -SandboxName $Name -Verb 'creds') {
    Write-Ok 'Done -- token refreshed in place, conversation history untouched.'
  } else {
    Write-Warning @"
Could not run the installer inside '$Name' automatically.
The fresh credentials ARE staged, so just run this inside the sandbox:

    bash .claude/scripts/history-sync.sh creds

Tip: check your build's syntax with  sbx --help  and tell me what it lists.
"@
  }
  return
}

# ---- Recreate path ----------------------------------------------------------
# Backend first: no point asking whether to destroy a sandbox we cannot reach.
Assert-SandboxBackend

Write-Step 'Checking saved history before destroying the sandbox'

# Last-chance backup. The Stop/SessionEnd hooks mirror history continuously, but a
# sandbox that is running RIGHT NOW may hold turns newer than the last mirror --
# and 'sbx rm' takes the ext4 volume (transcripts AND the memory directory) with it.
# Best-effort: a sandbox that is present but not running simply can't be exec'd into,
# which is not a reason to abort.
if (Test-SandboxExists $Name) {
  Write-Ok "sandbox '$Name' exists -- mirroring its history out first"
  if (-not (Invoke-InSandbox -SandboxName $Name -Verb 'backup')) {
    Write-Warning "Could not back up from inside '$Name' (not running?). Falling back to whatever is already mirrored."
  }
}

$saved = @(Get-ChildItem -Path (Join-Path $Store 'projects') -Filter *.jsonl -Recurse -ErrorAction SilentlyContinue)
if ($saved.Count -gt 0) {
  Write-Ok "$($saved.Count) transcript(s) mirrored to the host."
} else {
  Write-Warning @"
No transcripts found in $Store.

If sandbox '$Name' is still running with history you care about, STOP and run this
inside it first, otherwise 'sbx rm' will destroy it:

    bash .claude/scripts/history-sync.sh backup
"@
  if ((Read-Host 'Continue and destroy the sandbox anyway? (y/N)') -ne 'y') {
    Write-Host 'Aborted.'; return
  }
}

Update-StagedCredentials

Write-Step "Removing sandbox '$Name'"
& sbx rm $Name   # non-fatal: sandbox may not exist yet

Write-Step "Creating sandbox '$Name'"
& sbx create claude $ProjectDir --name $Name --kit $Kit
if ($LASTEXITCODE -ne 0) { throw "sbx create failed with code $LASTEXITCODE" }

Write-Step "Starting sandbox '$Name'"
Write-Ok 'History restores on session start; use /resume to reopen a past conversation.'
& sbx run --name $Name
