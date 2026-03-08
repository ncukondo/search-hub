# Installer for search-hub single binary (Windows)
# Usage: irm https://raw.githubusercontent.com/ncukondo/search-hub/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "ncukondo/search-hub"
$InstallDir = if ($env:SEARCH_HUB_INSTALL_DIR) { $env:SEARCH_HUB_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "search-hub" }
$BinaryName = "search-hub.exe"

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Err($msg) {
    Write-Host "error: $msg" -ForegroundColor Red
    exit 1
}

function Get-LatestVersion {
    $url = "https://api.github.com/repos/$Repo/releases/latest"
    try {
        $release = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "search-hub-installer" }
        return $release.tag_name
    } catch {
        Write-Err "Could not fetch latest version from GitHub."
    }
}

function Download-Binary($version, $dest) {
    $filename = "search-hub-windows-x64.exe"
    $url = "https://github.com/$Repo/releases/download/$version/$filename"
    Write-Info "Downloading $filename ($version)..."
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    } catch {
        Write-Err "Download failed. Check that release $version exists with binary $filename."
    }
}

function Configure-Path($dir) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -split ";" | Where-Object { $_ -eq $dir }) {
        return
    }
    Write-Info "Adding $dir to user PATH..."
    $newPath = "$currentPath;$dir"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = "$dir;$env:Path"
    Write-Info "  PATH updated (takes effect in new terminals)"
}

function Main {
    $version = if ($env:SEARCH_HUB_VERSION) { $env:SEARCH_HUB_VERSION } else { Get-LatestVersion }
    if (-not $version) {
        Write-Err "Could not determine latest version. Set `$env:SEARCH_HUB_VERSION='v0.x.x' to install a specific version."
    }
    Write-Info "Detected platform: windows-x64"
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    $dest = Join-Path $InstallDir $BinaryName
    Download-Binary $version $dest
    Configure-Path $InstallDir
    try {
        $ver = & $dest --version 2>&1
        Write-Success "Installed search-hub $ver to $dest"
    } catch {
        Write-Err "Installation completed but binary verification failed"
    }
    if (-not (Get-Command search-hub -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Info "Restart your terminal to use 'search-hub' command."
    }
}

Main
