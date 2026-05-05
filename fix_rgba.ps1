# Fix accidental double closing parentheses after rgba(121, 68, 148, ...)
$root = "src\app\pages"
$files = Get-ChildItem -Path $root -Filter "*.scss" -Recurse

$pattern = 'rgba\(121,\s*68,\s*148,\s*([0-9.]+)\)\)'

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  if ($content -match $pattern) {
    $fixed = [regex]::Replace($content, $pattern, 'rgba(121, 68, 148, $1)')
    Set-Content -Path $file.FullName -Value $fixed -NoNewline
    Write-Host "Fixed: $($file.FullName)"
  }
}

Write-Host "RGBA fixes complete."
