$files = Get-ChildItem 'e:\git\nova-invest\docs\tdd\*.md' | Sort-Object Name
foreach ($f in $files) {
    $lines = (Get-Content -LiteralPath $f.FullName).Count
    Write-Output ("{0,-30} {1,6} lines  {2,8:N0} bytes" -f $f.Name, $lines, $f.Length)
}
$totalLines = 0
$totalBytes = 0
foreach ($f in $files) {
    $totalLines += (Get-Content -LiteralPath $f.FullName).Count
    $totalBytes += $f.Length
}
Write-Output ("---")
Write-Output ("{0,-30} {1,6} lines  {2,8:N0} bytes" -f "TOTAL", $totalLines, $totalBytes)
