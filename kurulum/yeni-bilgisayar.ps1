# Satal — yeni bir bilgisayarı hazırlar (Windows 10/11).
# Normal PowerShell penceresinde çalıştırın (yönetici olarak DEĞİL); gereken yerlerde Windows izin ister.
# Tekrar çalıştırmak güvenlidir: kurulu olanı atlar, hiçbir şeyi silmez.
#
#   irm https://raw.githubusercontent.com/sadikalpe/satal/main/kurulum/yeni-bilgisayar.ps1 | iex
#
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$DEPO      = 'sadikalpe/satal'
$KLASOR    = Join-Path $HOME 'code\satal'
$PG_BIN    = 'C:\Program Files\PostgreSQL\16\bin'
$PG_HIZMET = 'postgresql-x64-16'
$PG_SIFRE  = 'postgres'   # yalnızca bu bilgisayarda, testlerin beklediği yerel şifre (crm/test/butun.test.js)

function Adim($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Tamam($m) { Write-Host "    $m" -ForegroundColor Green }
function Uyari($m) { Write-Host "    $m" -ForegroundColor Yellow }
function Yolu-Yenile {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget bulunamadı. Microsoft Store''dan "Uygulama Yükleyicisi" (App Installer) güncellenip tekrar denenmeli.'
}

# 1) Programlar
Adim 'Programlar kuruluyor (Git, Node.js, GitHub CLI, Python, VS Code, PostgreSQL 16)'
$paketler = @(
  @{ id = 'Git.Git' },
  @{ id = 'OpenJS.NodeJS.LTS' },
  @{ id = 'GitHub.cli' },
  @{ id = 'Python.Python.3.12' },
  @{ id = 'Microsoft.VisualStudioCode' },
  @{ id = 'PostgreSQL.PostgreSQL.16'; override = "--mode unattended --unattendedmodeui none --superpassword $PG_SIFRE --serverport 5432 --disable-components stackbuilder" }
)
foreach ($p in $paketler) {
  winget list --id $p.id -e --accept-source-agreements *> $null
  if ($LASTEXITCODE -eq 0) { Tamam "$($p.id) zaten kurulu"; continue }
  Write-Host "    $($p.id) kuruluyor..."
  $arg = @('install', '--id', $p.id, '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
  if ($p.override) { $arg += @('--override', $p.override) } else { $arg += '--silent' }
  & winget @arg | Out-Null
  # PostgreSQL kurucusu Türkçe Windows'ta veritabanı alanını açamayıp hata kodu dönebilir; aşağıda elle düzeltiliyor.
  if ($LASTEXITCODE -ne 0 -and $p.id -notlike 'PostgreSQL*') { Uyari "$($p.id) kurulamadı (kod $LASTEXITCODE)" } else { Tamam "$($p.id) kuruldu" }
}
Yolu-Yenile

# 2) Git kimliği (önceki kayıtlarla aynı; gerçek e-posta herkese açık depoya yazılmaz)
Adim 'Git ayarları'
git config --global user.name 'sadikalpe'
git config --global user.email '91697737+sadikalpe@users.noreply.github.com'
git config --global pull.ff only
git config --global core.autocrlf true
Tamam 'Git kimliği ayarlandı'

# 3) GitHub girişi
Adim 'GitHub girişi'
gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host '    Tarayıcıda GitHub açılacak; ekrandaki kodu girip "Authorize" deyin.' -ForegroundColor Yellow
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub girişi tamamlanmadı. Betiği tekrar çalıştırın.' }
}
gh auth setup-git *> $null
Tamam 'GitHub girişi tamam'

# 4) Proje
Adim "Proje: $KLASOR"
if (Test-Path (Join-Path $KLASOR '.git')) {
  git -C $KLASOR fetch --prune origin
  git -C $KLASOR pull --ff-only
  if ($LASTEXITCODE -ne 0) { Uyari 'Proje güncellenemedi (bu bilgisayarda kaydedilmemiş değişiklik olabilir); Claude''a sorun.' } else { Tamam 'Proje güncel' }
} else {
  New-Item -ItemType Directory -Force (Split-Path $KLASOR) | Out-Null
  git clone "https://github.com/$DEPO.git" $KLASOR
  Tamam 'Proje indirildi'
}

# 5) PostgreSQL hizmeti
Adim 'PostgreSQL'
if (-not (Get-Service $PG_HIZMET -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path "$PG_BIN\initdb.exe")) { throw 'PostgreSQL programı kurulamamış. Betiği tekrar çalıştırın.' }
  # Kurucunun bilinen hatası: Türkçe Windows'ta "Turkish_Türkiye.1254" dil adındaki "ü" yüzünden veritabanı alanı açılmaz.
  # Alanı kullanıcı klasöründe, ASCII dil adı (tr-TR) ile açıp hizmet olarak kaydediyoruz.
  $veri = Join-Path $HOME 'PostgreSQL\16\data'
  if (-not (Test-Path (Join-Path $veri 'PG_VERSION'))) {
    New-Item -ItemType Directory -Force (Split-Path $veri) | Out-Null
    $pw = Join-Path $env:TEMP "pgpw-$PID.txt"
    [IO.File]::WriteAllText($pw, $PG_SIFRE)
    & "$PG_BIN\initdb.exe" --pgdata=$veri --username=postgres --encoding=UTF8 --locale=tr-TR --auth=scram-sha-256 --pwfile=$pw | Out-Null
    Remove-Item $pw -Force
    if ($LASTEXITCODE -ne 0) { throw 'Veritabanı alanı oluşturulamadı.' }
  }
  Write-Host '    Hizmet kaydı için Windows yönetici izni isteyecek; "Evet" deyin.' -ForegroundColor Yellow
  $komut = "& '$PG_BIN\pg_ctl.exe' register -N $PG_HIZMET -D '$veri' -S auto; Start-Service $PG_HIZMET"
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $komut
}
$h = Get-Service $PG_HIZMET -ErrorAction SilentlyContinue
if (-not $h) { throw 'PostgreSQL hizmeti kaydedilemedi.' }
if ($h.Status -ne 'Running') { Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', "Start-Service $PG_HIZMET" }
Tamam 'PostgreSQL çalışıyor'

$env:PGPASSWORD = $PG_SIFRE
foreach ($db in 'satal', 'satal_test') {
  $var = & "$PG_BIN\psql.exe" -U postgres -h localhost -tAc "select 1 from pg_database where datname = '$db'"
  if ($var -ne '1') { & "$PG_BIN\psql.exe" -U postgres -h localhost -qc "create database $db" ; Tamam "$db veritabanı açıldı" } else { Tamam "$db veritabanı zaten var" }
}
Remove-Item Env:PGPASSWORD

# 6) Proje paketleri ve testler
Adim 'Proje paketleri ve testler'
Push-Location (Join-Path $KLASOR 'crm')
try {
  npm.cmd install --no-fund --no-audit
  npm.cmd test *> (Join-Path $env:TEMP 'satal-test.log')
  if ($LASTEXITCODE -eq 0) { Tamam 'Bütün testler geçti' } else { Uyari "Bazı testler geçmedi; ayrıntı: $env:TEMP\satal-test.log" }
} finally { Pop-Location }

Write-Host "`nHazır." -ForegroundColor Green
Write-Host "Claude uygulamasını kapatıp açın, Code sekmesinde klasör olarak şunu seçin:`n    $KLASOR"
