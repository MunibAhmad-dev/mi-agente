#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
binmode STDOUT, ':utf8';

my %keys = (
  en => {
    'com_nav_streak_days'      => '{{count}} {{count, plural, =1 {day} other {days}}} streak',
    'com_nav_streak_gift'      => '{{count}} more days to unlock +1 bonus session every day',
    'com_nav_streak_unlocked'  => 'Milestone reached! +1 bonus session every day unlocked.',
  },
  es => {
    'com_nav_streak_days'      => '{{count}} {{count, plural, =1 {día de racha} other {días de racha}}}',
    'com_nav_streak_gift'      => '{{count}} más días para desbloquear +1 sesión extra cada día',
    'com_nav_streak_unlocked'  => '¡Hito alcanzado! +1 sesión extra cada día desbloqueada.',
  },
);

for my $lang (qw/en es/) {
    my $f = "client/src/locales/$lang/translation.json";
    open my $fh, '<:utf8', $f or die "no se pudo abrir $f: $!\n";
    my $content = do { local $/; <$fh> };
    close $fh;

    for my $k (keys %{ $keys{$lang} }) {
        next if $content =~ /"$k":/;
        my $v = $keys{$lang}{$k};
        $content =~ s/("com_nav_theme_system":\s*"[^"]*")/$1,\n  "$k": "$v"/;
    }

    open my $out, '>:utf8', $f or die "no se pudo escribir $f: $!\n";
    print $out $content;
    close $out;
    print "OK $lang\n";
}
