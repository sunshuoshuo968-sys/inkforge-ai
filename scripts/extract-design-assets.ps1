param(
  [string]$SourcePath = (Join-Path $PSScriptRoot '..\qa\design-reference.png')
)

Add-Type -AssemblyName System.Drawing

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$publicDirectory = Join-Path $PSScriptRoot '..\public'
$source = [System.Drawing.Bitmap]::FromFile($resolvedSource)

function Export-Crop {
  param(
    [string]$Name,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $destination = Join-Path $publicDirectory $Name
  $crop = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($crop)
  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $sourceRectangle = New-Object System.Drawing.Rectangle($X, $Y, $Width, $Height)
    $targetRectangle = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $graphics.DrawImage($source, $targetRectangle, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
    $crop.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $crop.Dispose()
  }
}

try {
  Export-Crop 'design-brand.png' 22 17 224 49
  Export-Crop 'design-ai-button.png' 17 102 239 62
  Export-Crop 'design-header.png' 500 0 760 84
  Export-Crop 'design-sidebar.png' 0 650 270 330
  Export-Crop 'design-paper-bamboo.png' 1300 205 174 380
  Export-Crop 'design-paper-pavilion.png' 1170 730 304 270
  Export-Crop 'design-paper-mist.png' 580 920 540 80
}
finally {
  $source.Dispose()
}

$backgroundHelper = Join-Path $env:USERPROFILE '.codex\skills\.system\imagegen\scripts\remove_chroma_key.py'
if (Test-Path -LiteralPath $backgroundHelper) {
  foreach ($asset in @('brand', 'ai-button', 'paper-bamboo', 'paper-pavilion', 'paper-mist')) {
    $inputPath = Join-Path $publicDirectory "design-$asset.png"
    $outputPath = Join-Path $publicDirectory "design-$asset-alpha.png"
    $opaqueThreshold = if ($asset -eq 'paper-mist') { 230 } elseif ($asset -eq 'paper-bamboo') { 200 } else { 150 }
    & python $backgroundHelper --input $inputPath --out $outputPath --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold $opaqueThreshold --despill --force
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove the paper background from $asset" }
  }
}

$pavilionPath = Join-Path $publicDirectory 'design-paper-pavilion-alpha.png'
if (Test-Path -LiteralPath $pavilionPath) {
  $pavilionSource = [System.Drawing.Bitmap]::FromFile($pavilionPath)
  $pavilion = New-Object System.Drawing.Bitmap($pavilionSource)
  $pavilionSource.Dispose()
  for ($y = 0; $y -lt [Math]::Min(120, $pavilion.Height); $y++) {
    for ($x = 0; $x -lt [Math]::Min(160, $pavilion.Width); $x++) {
      $pavilion.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
    }
  }
  $temporaryPavilion = "$pavilionPath.tmp.png"
  $pavilion.Save($temporaryPavilion, [System.Drawing.Imaging.ImageFormat]::Png)
  $pavilion.Dispose()
  Move-Item -LiteralPath $temporaryPavilion -Destination $pavilionPath -Force
}

# Preserve the very pale shoreline wash with a tighter matte than the other assets.
$mistSourcePath = Join-Path $publicDirectory 'design-paper-mist.png'
$mistOutputPath = Join-Path $publicDirectory 'design-paper-mist-v3.png'
if ((Test-Path -LiteralPath $backgroundHelper) -and (Test-Path -LiteralPath $mistSourcePath)) {
  & python $backgroundHelper --input $mistSourcePath --out $mistOutputPath --auto-key border --soft-matte --transparent-threshold 4 --opaque-threshold 35 --despill --force
  if ($LASTEXITCODE -ne 0) { throw 'Failed to preserve the pale paper mist' }
}

$brandSourcePath = Join-Path $publicDirectory 'design-brand.png'
$brandOutputPath = Join-Path $publicDirectory 'design-brand-v2.png'
if ((Test-Path -LiteralPath $backgroundHelper) -and (Test-Path -LiteralPath $brandSourcePath)) {
  & python $backgroundHelper --input $brandSourcePath --out $brandOutputPath --auto-key border --soft-matte --transparent-threshold 4 --opaque-threshold 60 --despill --force
  if ($LASTEXITCODE -ne 0) { throw 'Failed to preserve the fine brand lettering' }
}
