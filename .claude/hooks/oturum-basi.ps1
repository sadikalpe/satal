# Her Claude oturumu açılırken çalışır (.claude/settings.json -> SessionStart).
# Amaç: hangi bilgisayarda açılırsa açılsın, GitHub'daki son hali indirmek ve
# başka bilgisayarda yarım kalan işi Claude'a haber vermek. Hiçbir şeyi silmez, üzerine yazmaz.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git -and (Test-Path 'C:\Program Files\Git\cmd\git.exe')) { $git = 'C:\Program Files\Git\cmd\git.exe' }

$proje = $env:CLAUDE_PROJECT_DIR
if (-not $proje) { $proje = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

function Yaz-Sonuc($icerik, $kisa) {
  $cikti = @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $icerik } }
  if ($kisa) { $cikti.systemMessage = $kisa }
  $cikti | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

if (-not $git) { Yaz-Sonuc 'Bu bilgisayarda Git kurulu değil; GitHub ile eşitleme yapılamadı. Kurulum: kurulum/yeni-bilgisayar.ps1' 'Git kurulu değil, proje GitHub ile eşitlenemedi.' }

function G { & $git -C $proje @args 2>$null }

$notlar = @()
G fetch --prune --quiet origin
if ($LASTEXITCODE -ne 0) { Yaz-Sonuc 'GitHub''a ulaşılamadı (internet yok ya da giriş gerekli: gh auth login). Proje bu bilgisayardaki son haliyle açıldı; başka bilgisayardaki son değişiklikler burada olmayabilir.' 'GitHub''a ulaşılamadı; projenin en son hali olmayabilir.' }

$dal = (G rev-parse --abbrev-ref HEAD)
$ust = (G rev-parse --abbrev-ref --symbolic-full-name '@{u}')
$kirli = (G status --porcelain)
$kisa = $null

if ($ust) {
  $geride = [int](G rev-list --count "HEAD..$ust")
  $ileride = [int](G rev-list --count "$ust..HEAD")
  if ($geride -gt 0 -and -not $kirli -and $ileride -eq 0) {
    G pull --ff-only --quiet
    if ($LASTEXITCODE -eq 0) {
      $notlar += "GitHub'dan $geride yeni kayıt indirildi ($dal dalı); başka bilgisayarda yapılan işler artık burada."
      $kisa = "Proje güncellendi: başka bilgisayardan $geride yeni kayıt geldi."
    } else { $notlar += "GitHub'da $geride yeni kayıt var ama otomatik indirilemedi; kullanıcıya sormadan birleştirme yapma." }
  } elseif ($geride -gt 0) {
    $notlar += "GitHub'da $dal dalında $geride yeni kayıt var ama bu bilgisayarda kaydedilmemiş/gönderilmemiş değişiklik de var (ileride: $ileride). Otomatik indirilmedi; ne yapılacağını kullanıcıya sor, hiçbir şeyin üzerine yazma."
    $kisa = 'Dikkat: hem bu bilgisayarda hem GitHub''da yeni değişiklik var.'
  }
  if ($ileride -gt 0 -and $geride -eq 0) { $notlar += "Bu bilgisayarda GitHub'a gönderilmemiş $ileride kayıt var ($dal)." }
} else {
  $notlar += "Şu anki dal ($dal) GitHub'a hiç gönderilmemiş."
}
if ($kirli) { $notlar += 'Bu bilgisayarda kaydedilmemiş değişiklikler var: ' + (($kirli | Select-Object -First 10) -join '; ') }

# Başka bilgisayarda son 7 günde güncellenmiş, şu an açık olmayan dallar (yarım kalmış iş olabilir)
$sinir = (Get-Date).AddDays(-7)
$dallar = G for-each-ref --sort=-committerdate refs/remotes/origin --format='%(refname:short)|%(committerdate:iso-strict)|%(subject)'
$diger = @()
foreach ($s in $dallar) {
  $p = $s -split '\|', 3
  if ($p.Count -lt 3 -or $p[0] -eq 'origin/HEAD' -or $p[0] -eq 'origin' -or $p[0] -eq $ust) { continue }
  if ([datetime]$p[1] -lt $sinir) { continue }
  G merge-base --is-ancestor $p[0] HEAD
  if ($LASTEXITCODE -eq 0) { continue }   # zaten bu dalın içinde, yarım iş değil
  $tarih = ([datetime]$p[1]).ToString('dd.MM.yyyy HH:mm')
  $diger += "$($p[0]) ($tarih): $($p[2])"
}
if ($diger) { $notlar += 'Son 7 günde güncellenmiş başka dallar (başka bilgisayarda yarım kalmış iş olabilir): ' + (($diger | Select-Object -First 5) -join ' | ') }

if (-not $notlar) { $notlar += "Proje GitHub ile aynı ($dal dalı)." }
Yaz-Sonuc ('Çoklu bilgisayar eşitlemesi: ' + ($notlar -join ' ')) $kisa
