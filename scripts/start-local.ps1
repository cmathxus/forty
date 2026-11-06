param([int]$Port = 5161)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkDotnet = (Get-Command dotnet -ErrorAction Stop).Source
& $sdkDotnet build (Join-Path $projectRoot 'DudaErp.sln') -c Debug --nologo
if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou.' }

$runtimeDotnet = Join-Path $env:LOCALAPPDATA 'forty-dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $runtimeDotnet)) { $runtimeDotnet = $sdkDotnet }
$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousUrls = $env:ASPNETCORE_URLS
$previousLogging = $env:Logging__LogLevel__Microsoft
Push-Location (Join-Path $projectRoot 'src\DudaErp.Api')
try {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:ASPNETCORE_URLS = "http://127.0.0.1:$Port"
    $env:Logging__LogLevel__Microsoft = 'Warning'
    Write-Host "FORTY local: http://127.0.0.1:$Port (Ctrl+C para encerrar)"
    & $runtimeDotnet 'bin/Debug/net8.0/DudaErp.Api.dll'
} finally {
    Pop-Location
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ASPNETCORE_URLS = $previousUrls
    $env:Logging__LogLevel__Microsoft = $previousLogging
}
