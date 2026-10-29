# Draws the app icon and saves it as assets\icon.ico (plus a 256px icon.png preview).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
#   -Design clock-and-book  a clock with an open book in front of it (default)
#   -Design book-in-clock   an open book inside a clock face
param(
  [ValidateSet('book-in-clock', 'clock-and-book')] [string]$Design = 'clock-and-book',
  [string]$OutDir
)
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
if (-not $OutDir) { $OutDir = Join-Path $root 'assets' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

$green = [System.Drawing.Color]::FromArgb(24, 168, 72)
$bgLight = [System.Drawing.Color]::FromArgb(220, 247, 224)
$bgDark = [System.Drawing.Color]::FromArgb(172, 230, 184)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-LinePen($brushOrColor, [float]$width) {
  $pen = New-Object System.Drawing.Pen $brushOrColor, $width
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  return $pen
}

# Open book: two slanted pages meeting at a spine. (cx, cy) is the centre, w the full width.
function New-BookPath([float]$cx, [float]$cy, [float]$w, [float]$s) {
  $hw = $w / 2; $h = $w * 0.68; $top = $cy - $h / 2; $dip = $w * 0.08
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $left = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($cx * $s), (($top + $dip) * $s)),
    (New-Object System.Drawing.PointF (($cx - $hw) * $s), ($top * $s)),
    (New-Object System.Drawing.PointF (($cx - $hw) * $s), (($top + $h) * $s)),
    (New-Object System.Drawing.PointF ($cx * $s), (($top + $h + $dip) * $s)))
  $right = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($cx * $s), (($top + $dip) * $s)),
    (New-Object System.Drawing.PointF (($cx + $hw) * $s), ($top * $s)),
    (New-Object System.Drawing.PointF (($cx + $hw) * $s), (($top + $h) * $s)),
    (New-Object System.Drawing.PointF ($cx * $s), (($top + $h + $dip) * $s)))
  $p.AddPolygon($left)
  $p.AddPolygon($right)
  return $p
}

function New-IconPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 256.0

  # Soft green rounded square, with a faint crosshatch on the larger sizes
  $tile = New-RoundedRect (8 * $s) (8 * $s) (240 * $s) (240 * $s) (68 * $s)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF $size, $size), $bgLight, $bgDark
  $g.FillPath($bg, $tile)
  $hatch = $null
  if ($size -ge 64) {
    $hatch = New-Object System.Drawing.Drawing2D.HatchBrush 'DiagonalCross', ([System.Drawing.Color]::FromArgb(28, $green)), ([System.Drawing.Color]::Transparent)
    $g.SetClip($tile)
    $g.FillPath($hatch, $tile)
    $g.ResetClip()
  }

  # Lines get relatively thicker on tiny icons so they stay readable
  $lw = [Math]::Max(11 * $s, 1.6)
  $pen = New-LinePen $green $lw

  if ($Design -eq 'book-in-clock') {
    $r = 84
    $g.DrawEllipse($pen, (128 - $r) * $s, (128 - $r) * $s, 2 * $r * $s, 2 * $r * $s)
    if ($size -ge 32) {
      foreach ($a in 0, 90, 180, 270) {
        $rad = $a * [Math]::PI / 180
        $x1 = 128 + [Math]::Cos($rad) * ($r - 14); $y1 = 128 + [Math]::Sin($rad) * ($r - 14)
        $x2 = 128 + [Math]::Cos($rad) * ($r - 26); $y2 = 128 + [Math]::Sin($rad) * ($r - 26)
        $g.DrawLine($pen, $x1 * $s, $y1 * $s, $x2 * $s, $y2 * $s)
      }
    }
    $g.DrawPath($pen, (New-BookPath 128 128 ($(if ($size -ge 32) { 84 } else { 100 })) $s))
  } else {
    # Clock up and to the left, book in front at the bottom right
    $cx = 110; $cy = 108; $r = 66
    $g.DrawEllipse($pen, ($cx - $r) * $s, ($cy - $r) * $s, 2 * $r * $s, 2 * $r * $s)
    $g.DrawLine($pen, $cx * $s, $cy * $s, $cx * $s, ($cy - 38) * $s)
    $g.DrawLine($pen, $cx * $s, $cy * $s, ($cx + 26) * $s, $cy * $s)

    $book = New-BookPath 170 170 76 $s
    # Erase the clock behind the book with the background, leaving a small gap
    $g.FillPath($bg, $book)
    $g.DrawPath((New-LinePen $bg ($lw * 3)), $book)
    if ($hatch) {
      $g.SetClip($tile)
      $g.FillPath($hatch, $book)
      $g.DrawPath((New-LinePen $hatch ($lw * 3)), $book)
      $g.ResetClip()
    }
    $g.DrawPath($pen, $book)
  }

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

# An .ico file is a small header plus one PNG image per size.
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = $sizes | ForEach-Object { ,(New-IconPng $_) }

$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$images[$i].Length); $w.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($img in $images) { $w.Write($img) }
$w.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.ico'), $out.ToArray())
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.png'), $images[-1])
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon-32.png'), $images[2])
"Saved $OutDir\icon.ico ($Design)"
