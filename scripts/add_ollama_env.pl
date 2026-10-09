#!/usr/bin/env perl
# add_ollama_env.pl — FASE 26: añade env de rendimiento al servicio ollama
# del docker-compose.override.yml (idempotente).
use strict;
use warnings;

my $file = 'docker-compose.override.yml';
open my $fh, '<', $file or die "no se pudo abrir $file: $!\n";
my $content = do { local $/; <$fh> };
close $fh;

if ($content =~ /OLLAMA_KEEP_ALIVE/) {
    print "ya tiene environment de rendimiento — sin cambios\n";
    exit 0;
}

my $needle = qq{    ports:\n      - "\${OLLAMA_HOST_PORT:-11434}:11434"\n    volumes:\n      - ollama-data:/root/.ollama};
my $insert = qq{    ports:\n      - "\${OLLAMA_HOST_PORT:-11434}:11434"\n    environment:\n      # FASE 26 - rendimiento local: mantener modelos cargados (evita cold load\n      # de 5-10s), paralelizar peticiones y KV cache q8_0 (menos RAM, mas rapido\n      # en CPU). El think:false global lo aplica el Ollama Fast Proxy del api\n      # (routes/ollamaProxy.js).\n      - OLLAMA_KEEP_ALIVE=30m\n      - OLLAMA_NUM_PARALLEL=2\n      - OLLAMA_MAX_LOADED_MODELS=2\n      - OLLAMA_KV_CACHE_TYPE=q8_0\n    volumes:\n      - ollama-data:/root/.ollama};

if ($content =~ /\Q$needle\E/) {
    $content =~ s/\Q$needle\E/$insert/;
    open my $out, '>', $file or die "no se pudo escribir $file: $!\n";
    print $out $content;
    close $out;
    print "OK: environment de rendimiento agregado al servicio ollama\n";
} else {
    print "AVISO: no se encontro el bloque esperado del servicio ollama (revisar a mano)\n";
    exit 1;
}
