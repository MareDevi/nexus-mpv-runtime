param(
	[Parameter(Mandatory = $true)]
	[string]$Target,

	[Parameter(Mandatory = $true)]
	[string]$StageDir
)

$ErrorActionPreference = "Stop"

$dll = Get-ChildItem -Path (Join-Path $StageDir "bin") -Filter "*mpv-2.dll" | Select-Object -First 1
if (-not $dll) {
	throw "Could not find mpv DLL under $StageDir/bin"
}

$libDir = Join-Path $StageDir "lib"
New-Item -ItemType Directory -Force -Path $libDir | Out-Null

$defPath = Join-Path $libDir "mpv.def"
$libPath = Join-Path $libDir "mpv.lib"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsInstall) {
	throw "Could not find Visual Studio C++ tools"
}

$vcVars = Join-Path $vsInstall "VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcVars)) {
	throw "Could not find vcvars64.bat at $vcVars"
}

$dump = & cmd.exe /c "`"$vcVars`" >nul && dumpbin /exports `"$($dll.FullName)`""
$exports = @()

foreach ($line in $dump) {
	if ($line -match "^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+(\S+)$") {
		$name = $Matches[1]
		if ($name -like "mpv_*") {
			$exports += $name
		}
	}
}

if ($exports.Count -eq 0) {
	throw "No mpv_* exports found in $($dll.FullName)"
}

@("LIBRARY $($dll.Name)", "EXPORTS") + ($exports | Sort-Object -Unique | ForEach-Object { "`t$_" }) |
	Set-Content -Path $defPath -Encoding ASCII

& cmd.exe /c "`"$vcVars`" >nul && lib /def:`"$defPath`" /machine:x64 /out:`"$libPath`""

if (-not (Test-Path $libPath)) {
	throw "MSVC import library was not created at $libPath"
}

Write-Host "Created $libPath for $Target"
