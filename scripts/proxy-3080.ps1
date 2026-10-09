# proxy-3080.ps1 — proxy inverso hacia el dashboard (3080) para preview.
# WebClient (probado renderiza la app) + reenvío de headers (sin Accept-Encoding
# para que el servidor devuelva plano) + stub de SSE + timeout por petición.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/proxy-3080.ps1
$ErrorActionPreference = 'Stop'

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:3123/')
$listener.Start()
Write-Output 'PROXY_READY http://127.0.0.1:3123'
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $req = $ctx.Request
    $target = 'http://localhost:3080' + $req.RawUrl
    $accept = $req.Headers['Accept']
    if ($accept -and $accept -match 'text/event-stream') {
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentType = 'text/event-stream'
      $ctx.Response.Close()
      continue
    }
    $wc = New-Object System.Net.WebClient
    $wc.Proxy = $null
    $wc.Encoding = [System.Text.Encoding]::UTF8
    foreach ($hk in $req.Headers.AllKeys) {
      if ($hk -in @('Host','Connection','Content-Length','Accept-Encoding')) { continue }
      try { $wc.Headers.Add($hk, $req.Headers[$hk]) } catch {}
    }
    if ($req.HttpMethod -eq 'POST') {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $data = $wc.UploadString($target, 'POST', $body)
    } else {
      $data = $wc.DownloadString($target)
    }
    $resp = $ctx.Response
    $resp.StatusCode = 200
    $resp.ContentType = 'text/html'
    $buf = [System.Text.Encoding]::UTF8.GetBytes($data)
    $resp.OutputStream.Write($buf, 0, $buf.Length)
  } catch {
    try {
      $resp = $ctx.Response
      $resp.StatusCode = 502
      $m = [System.Text.Encoding]::UTF8.GetBytes('proxy error: ' + $_.Exception.Message)
      $resp.OutputStream.Write($m, 0, $m.Length)
    } catch {}
  } finally {
    try { $ctx.Response.Close() } catch {}
  }
}
