param(
    [string]$sourceImage = "D:\CertiStock-Office-Package\CertiStock-Server\build\icon.png",
    [string]$outputDir = "D:\CertiStock-Office-Package\CertiStock-Server\build\appx"
)

Add-Type -AssemblyName System.Drawing

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

function Resize-Image {
    param([string]$img_path, [string]$out_path, [int]$w, [int]$h)
    $img = [System.Drawing.Image]::FromFile($img_path)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    
    $graph.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    
    $graph.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($out_path, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    Write-Host "Created $out_path (${w}x${h})"
}

Resize-Image $sourceImage (Join-Path $outputDir "Square44x44Logo.png") 44 44
Resize-Image $sourceImage (Join-Path $outputDir "Square150x150Logo.png") 150 150
Resize-Image $sourceImage (Join-Path $outputDir "Wide310x150Logo.png") 310 150
Resize-Image $sourceImage (Join-Path $outputDir "StoreLogo.png") 50 50

Write-Host "AppX icons generated successfully!"
