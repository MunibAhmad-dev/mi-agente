#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
binmode STDOUT, ':utf8';

my %keys = (
  en => {
    'com_nav_streak_days' => '{{count}} day streak',
    'com_nav_streak_gift' => '{{count}} more days to unlock +1 bonus session every day',
  },
  es => {
    'com_nav_streak_days' => '{{count}} días de racha',
    'com_nav_streak_gift' => '{{count}} más días para desbloquear +1 sesión extra cada día',
  },
);

for my $lang (qw/en es/) {
    my $f = "client/src/locales/$lang/translation.json";
    open my $fh, '<:utf8', $f or die "no se pudo abrir $f: $!\n";
    my $content = do { local $/; <$fh> };
    close $fh;
    for my $k (keys %{ $keys{$lang} }) {
        my $v = $keys{$lang}{$k};
        $content =~ s/"$k":\s*"[^"]*"/"$k": "$v"/;
    }
    open my $out, '>:utf8', $f or die "no se pudo escribir $f: $!\n";
    print $out $content;
    close $out;
    print "OK $lang\n";
}
