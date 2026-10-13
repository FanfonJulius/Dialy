# Draws the placeholder Daily icons (map pin on the brand orange-yellow), matching static/favicon.svg.
# Geometry is defined on a 512 grid and scaled. Re-run with `npm run icons` after changing the design.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$outDir = Join-Path $PSScriptRoot '..\static\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$brand = [System.Drawing.ColorTranslator]::FromHtml('#FFB020')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#1A1A1A')

function New-RoundedSquarePath([float]$size, [float]$radius) {
    $d = 2 * $radius
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc([float]0, [float]0, $d, $d, [float]180, [float]90)
    $path.AddArc($size - $d, [float]0, $d, $d, [float]270, [float]90)
    $path.AddArc($size - $d, $size - $d, $d, $d, [float]0, [float]90)
    $path.AddArc([float]0, $size - $d, $d, $d, [float]90, [float]90)
    $path.CloseFigure()
    return $path
}

function New-PinPath([float]$k) {
    # Circle head (r 110) whose tangents meet at the tip 2r below the centre.
    $r = 110 * $k
    $cx = 256 * $k
    $cy = 201 * $k
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($cx - $r, $cy - $r, 2 * $r, 2 * $r, [float]150, [float]240)
    $path.AddLine($path.GetLastPoint(), (New-Object System.Drawing.PointF($cx, (421 * $k))))
    $path.CloseFigure()
    return $path
}

function Save-Icon([int]$size, [bool]$fullBleed, [string]$name) {
    $k = $size / 512
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $brandBrush = New-Object System.Drawing.SolidBrush($brand)
    $inkBrush = New-Object System.Drawing.SolidBrush($ink)
    try {
        if ($fullBleed) {
            $graphics.FillRectangle($brandBrush, 0, 0, $size, $size)
        } else {
            $background = New-RoundedSquarePath $size (112 * $k)
            $graphics.FillPath($brandBrush, $background)
            $background.Dispose()
        }
        $pin = New-PinPath $k
        $graphics.FillPath($inkBrush, $pin)
        $pin.Dispose()
        $hole = 46 * $k
        $graphics.FillEllipse($brandBrush, (256 * $k) - $hole, (201 * $k) - $hole, 2 * $hole, 2 * $hole)
        $bitmap.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $brandBrush.Dispose()
        $inkBrush.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

# Maskable and Apple icons are full-bleed: the OS applies its own shape.
Save-Icon 192 $false 'icon-192.png'
Save-Icon 512 $false 'icon-512.png'
Save-Icon 512 $true 'maskable-512.png'
Save-Icon 180 $true 'apple-touch-icon.png'
Write-Output "Icons written to $((Resolve-Path $outDir).Path)"
