#!/usr/bin/perl
use strict;
use warnings;

my @files = (
  ['client/src/locales/es/translation.json', {
    'com_nav_streak_gift_title' => '¡Hito alcanzado! 🎁',
    'com_nav_streak_gift_body'  => 'Llevas {{count}} días usando el sistema.',
    'com_nav_streak_claim'      => 'Reclamar regalo',
  }],
  ['client/src/locales/en/translation.json', {
    'com_nav_streak_gift_title' => 'Milestone reached! 🎁',
    'com_nav_streak_gift_body'  => 'You have used the system for {{count}} days.',
    'com_nav_streak_claim'      => 'Claim gift',
  }],
);

for my $pair (@files) {
  my ($file, $keys) = @$pair;
  open my $fh, '<', $file or die "open $file: $!";
  my $data = do { local $/; <$fh> };
  close $fh;
  for my $key (keys %$keys) {
    next if $data =~ /"$key"\s*:/;
    my $value = $keys->{$key};
    $data =~ s/(\n\s*)\}/$1  "$key": "$value",\n}/s;
  }
  open my $out, '>', $file or die "write $file: $!";
  print $out $data;
  close $out;
  print "updated $file\n";
}
