Add-Type -AssemblyName System.Drawing

function Crop-Image {
    param(
        [string]$SourcePath,
        [string]$DestPath,
        [int]$X,
        [int]$Y,
        [int]$Width,
        [int]$Height
    )
    $src = [System.Drawing.Image]::FromFile($SourcePath)
    
    # Clamp bounds to image dimensions
    $X = [Math]::Max(0, $X)
    $Y = [Math]::Max(0, $Y)
    $Width = [Math]::Min($src.Width - $X, $Width)
    $Height = [Math]::Min($src.Height - $Y, $Height)
    
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $Width, $Height)
    $dest = New-Object System.Drawing.Bitmap($Width, $Height)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $g.DrawImage($src, $destRect, $rect, [System.Drawing.GraphicsUnit]::Pixel)
    
    # Save with high quality JPEG (95%)
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    
    $destDir = [System.IO.Path]::GetDirectoryName($DestPath)
    if (-not [string]::IsNullOrEmpty($destDir) -and -not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    $dest.Save($DestPath, $jpegCodec, $encoderParams)
    
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Host "Saved: $DestPath ($Width x $Height px)"
}

# Tight crop configurations containing strictly the face and Tefillin (Shel Rosh)
$cropConfigs = @(
    @{ File = "images.jpg";       X = 20;  Y = 0;   Width = 210; Height = 280 }
    @{ File = "images (1).jpg";   X = 260; Y = 35;  Width = 180; Height = 270 }
    @{ File = "images (2).jpg";   X = 65;  Y = 0;   Width = 100; Height = 165 }
    @{ File = "images (3).jpg";   X = 95;  Y = 50;  Width = 185; Height = 320 }
    @{ File = "images (4).jpg";   X = 190; Y = 40;  Width = 180; Height = 280 }
    @{ File = "images (5).jpg";   X = 60;  Y = 0;   Width = 210; Height = 300 }
    @{ File = "images (6).jpg";   X = 65;  Y = 35;  Width = 105; Height = 135 }
    @{ File = "images (7).jpg";   X = 170; Y = 95;  Width = 160; Height = 270 }
    @{ File = "images (8).jpg";   X = 35;  Y = 10;  Width = 180; Height = 315 }
    @{ File = "images (9).jpg";   X = 50;  Y = 10;  Width = 95;  Height = 110 }
)

$samplesDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($samplesDir)) { $samplesDir = (Get-Location).Path }
$croppedSubdir = Join-Path $samplesDir "cropped"

Write-Host "Processing $($cropConfigs.Count) images tightly focused on Face + Tefillin..." -ForegroundColor Cyan

foreach ($c in $cropConfigs) {
    $src = Join-Path $samplesDir $c.File
    if (-not (Test-Path $src)) {
        Write-Warning "File not found: $src"
        continue
    }
    
    # 1. Save in samples/ as cropped_<name>.jpg
    $destRoot = Join-Path $samplesDir "cropped_$($c.File)"
    Crop-Image -SourcePath $src -DestPath $destRoot -X $c.X -Y $c.Y -Width $c.Width -Height $c.Height
    
    # 2. Save in samples/cropped/<name>.jpg
    $destSub = Join-Path $croppedSubdir $c.File
    Crop-Image -SourcePath $src -DestPath $destSub -X $c.X -Y $c.Y -Width $c.Width -Height $c.Height
}

Write-Host "All tight Face + Tefillin crop images created successfully!" -ForegroundColor Green
