#!/usr/bin/perl
# FASE 28 — habilita la memoria nativa estilo Mem0 de LibreChat apuntada al
# LLM local (Ollama). Reutiliza el sistema existente (set_memory/delete_memory,
# agente de memoria, panel UI) — sin duplicar y sin deps nuevas.
use strict;
use warnings;

my $file = 'librechat.yaml';
my $data = do { local $/; open my $fh, '<', $file or die $!; <$fh> };

# Solo inserta una vez (idempotente).
if ($data =~ /^memory:\s*\n/ && $data !~ /memory:\n\s+disabled: false/) {
  # Ya existe una seccion memory (quizas comentada) -> no insertar duplicado.
  print "memory section already present; skipping insert\n";
  exit 0;
}

my $block = qq{memory:
  # FASE 28: memoria persistente del usuario (estilo Mem0). El agente de
  # memoria corre con el LLM local (Ollama) y extrae/actualiza/borra
  # memorias automaticamente desde el chat. El panel UI esta en el menu.
  disabled: false
  validKeys: [preferences, work_info, personal_info, skills, interests, context, projects, facts]
  tokenLimit: 10000
  maxInputTokens: 12000
  personalize: true
  agent:
    enabled: true
    provider: "Ollama (local)"
    model: "qwen3:0.6b"
    instructions: "You are a memory management assistant. Store and manage user information accurately."
    model_parameters:
      temperature: 0.1

};

# Inserta justo antes del bloque comentado de "Memory configuration".
if ($data =~ /^# Memory configuration for user memories/m) {
  $data =~ s/^# Memory configuration for user memories/$block# Memory configuration for user memories/m;
} else {
  # fallback: al final del archivo
  $data .= "\n$block";
}

open my $out, '>', $file or die $!;
print $out $data;
close $out;
print "memory config inserted\n";
