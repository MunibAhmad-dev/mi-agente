#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
binmode STDOUT, ':utf8';

for my $f (@ARGV) {
    open my $fh, '<:utf8', $f or die "no se pudo abrir $f: $!\n";
    my $content = do { local $/; <$fh> };
    close $fh;

    $content =~ s/00e1/\x{e1}/g;   # á
    $content =~ s/00ed/\x{ed}/g;   # í
    $content =~ s/00f3/\x{f3}/g;   # ó
    $content =~ s/00e9/\x{e9}/g;   # é
    $content =~ s/00fa/\x{fa}/g;   # ú
    $content =~ s/00f1/\x{f1}/g;   # ñ
    $content =~ s/00c1/\x{c1}/g;   # Á
    $content =~ s/00cd/\x{cd}/g;   # Í

    open my $out, '>:utf8', $f or die "no se pudo escribir $f: $!\n";
    print $out $content;
    close $out;
    print "OK $f\n";
}
