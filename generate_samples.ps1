$images = @()

function Is-Image-File($fileName) {
    $lower = $fileName.ToLower()
    return ($lower.EndsWith(".jpg") -or $lower.EndsWith(".jpeg") -or $lower.EndsWith(".png"))
}

function Add-Image-Entry {
    param($file, $group, $expected, $description, $displayName)
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $b64 = [System.Convert]::ToBase64String($bytes)
    $lower = $file.Name.ToLower()
    $mime = if ($lower.EndsWith(".png")) { "image/png" } else { "image/jpeg" }
    $dataUri = "data:" + $mime + ";base64," + $b64
    $name = $displayName.Replace('\', '/').Replace('"', '\"')
    $desc = $description.Replace('\', '/').Replace('"', '\"')
    
    return '{ "name": "' + $name + '", "group": "' + $group + '", "expected": "' + $expected + '", "description": "' + $desc + '", "path": "' + $dataUri + '" }'
}

# 1. samples/OK (Primary Ground Truth: KOSHER / ALIGNED)
if (Test-Path "samples/OK") {
    $okFiles = Get-ChildItem -Path "samples/OK" -File
    foreach ($f in $okFiles) {
        if (Is-Image-File($f.Name)) {
            $images += Add-Image-Entry -file $f -group "OK" -expected "ALIGNED" -description "Kosher / On Hair" -displayName "OK/$($f.Name)"
        }
    }
}

# 2. samples/WRONG (Primary Ground Truth: PASSUL / FOREHEAD_ERROR)
if (Test-Path "samples/WRONG") {
    $wrongFiles = Get-ChildItem -Path "samples/WRONG" -File
    foreach ($f in $wrongFiles) {
        if (Is-Image-File($f.Name)) {
            $images += Add-Image-Entry -file $f -group "WRONG" -expected "FOREHEAD_ERROR" -description "Invalid / On Forehead" -displayName "WRONG/$($f.Name)"
        }
    }
}

# 3. samples root & cropped
if (Test-Path "samples/cropped") {
    $cropFiles = Get-ChildItem -Path "samples/cropped" -File
    foreach ($f in $cropFiles) {
        if (Is-Image-File($f.Name)) {
            $exp = if ($f.Name -match "images \(3\)|images \(4\)|images \(6\)") { "FOREHEAD_ERROR" } else { "ALIGNED" }
            $images += Add-Image-Entry -file $f -group "cropped/" -expected $exp -description "Cropped face" -displayName "cropped/$($f.Name)"
        }
    }
}

# 4. Root folder test images
$rootFiles = Get-ChildItem -Path "." -File
foreach ($f in $rootFiles) {
    if (Is-Image-File($f.Name)) {
        $exp = if ($f.Name -match "exmple3") { "FOREHEAD_ERROR" } else { "ALIGNED" }
        $images += Add-Image-Entry -file $f -group "root/" -expected $exp -description "Root test image" -displayName "$($f.Name)"
    }
}

$content = "const embeddedSamples = [`n" + ($images -join ",`n") + "`n];"
[System.IO.File]::WriteAllText("samples_data.js", $content, [System.Text.Encoding]::UTF8)
Write-Host "Generated samples_data.js successfully! Total images: $($images.Count)" -ForegroundColor Green
