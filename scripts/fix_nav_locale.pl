#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
binmode STDOUT, ':utf8';

for my $lang (qw/en es/) {
    my $f = "client/src/locales/$lang/translation.json";
    open my $fh, '<:utf8', $f or die "no se pudo abrir $f: $!\n";
    my $content = do { local $/; <$fh> };
    close $fh;

    if ($content !~ /"com_nav_open_feature":/) {
        my $v = $lang eq 'es' ? 'Abrir' : 'Open';
        $content =~ s/("com_nav_theme_system":\s*"[^"]*")/$1,\n  "com_nav_open_feature": "$v"/;
    }
    if ($content =~ /"com_nav_open_full":\s*"[^"]*"/) {
        my $v = $lang eq 'es' ? 'Abrir' : 'Open';
        $content =~ s/"com_nav_open_full":\s*"[^"]*"/"com_nav_open_full": "$v"/;
    }

    open my $out, '>:utf8', $f or die "no se pudo escribir $f: $!\n";
    print $out $content;
    close $out;
    print "OK $lang\n";
}
