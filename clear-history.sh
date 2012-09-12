#!/bin/sh
# remove recent docs

rm ~/.local/share/recently-used.xbel && touch ~/.local/share/recently-used.xbel
notify-send "Recent files history was cleared"

