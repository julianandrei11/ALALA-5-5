# Replace purple colors with #794494 consistently across SCSS files

$root = "src\app\pages"
$files = Get-ChildItem -Path $root -Filter "*.scss" -Recurse

# Map of purple-like hex codes to the unified brand color
$hexes = @(
  '#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#9d4edd',
  '#7b1fa2', '#9c27b0', '#a855f7', '#7c3aed', '#a78bfa', '#8b5cf6'
) | Select-Object -Unique

# Common rgba accent purples (shadows/glows)
$rgbaSources = @(
  'rgba(139, 92, 246,',
  'rgba(124, 58, 237,',
  'rgba(109, 40, 217,',
  'rgba(123, 31, 162,',
  'rgba(168, 85, 247,'
) | Select-Object -Unique

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  $modified = $false

  foreach ($hex in $hexes) {
    if ($content -match [regex]::Escape($hex)) {
      $content = $content -replace [regex]::Escape($hex), '#794494'
      $modified = $true
    }
  }

  foreach ($rgba in $rgbaSources) {
    if ($content -match [regex]::Escape($rgba)) {
      # Replace prefix while keeping alpha that follows
      $pattern = [regex]::Escape($rgba)
      $content = [regex]::Replace($content, $pattern + '\s*([0-9.]+\))', 'rgba(121, 68, 148, $1)')
      $modified = $true
    }
  }

  if ($modified) {
    Set-Content -Path $file.FullName -Value $content -NoNewline
    Write-Host "Updated: $($file.FullName)"
  }
}

Write-Host "Done!"
