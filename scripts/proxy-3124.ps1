# proxy-3080.ps1 — proxy inverso mínimo hacia el dashboard (3080) para preview.
# Concurrencia por petición (Task.Run) para no congelarse con SSE/long-poll.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/proxy-3080.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::Gzip -bor [System.Net.DecompressionMethods]::Deflate
$handler.UseProxy = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(120)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:3124/')
$listener.Start()
Write-Output 'PROXY_READY http://127.0.0.1:3124'

function Handle-Request($ctx) {
  try {
    $req = $ctx.Request
    $target = 'http://localhost:3080' + $req.RawUrl
    $msg = New-Object System.Net.Http.HttpRequestMessage
    $msg.RequestUri = [Uri]$target
    $msg.Method = [System.Net.Http.HttpMethod]::new($req.HttpMethod)
    foreach ($hk in $req.Headers.AllKeys) {
      if ($hk -in @('Host','Connection','Content-Length','Content-Type')) { continue }
      try { $msg.Headers.TryAddWithoutValidation($hk, $req.Headers[$hk]) | Out-Null } catch {}
    }
    if ($req.HttpMethod -eq 'POST') {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $ctype = $req.ContentType
      if (-not $ctype) { $ctype = 'application/json' }
      $msg.Content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, $ctype)
    }
    $res = $client.SendAsync($msg).GetAwaiter().GetResult()
    $bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $resp = $ctx.Response
    $resp.StatusCode = [int]$res.StatusCode
    if ($res.Content.Headers.ContentType -ne $null) {
      $resp.ContentType = $res.Content.Headers.ContentType.MediaType
    }
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
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

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }
  [System.Threading.Tasks.Task]::Run([Action]{ Handle-Request $ctx }) | Out-Null
}
