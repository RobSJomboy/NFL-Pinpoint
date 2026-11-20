# NFL Pinpoint Challenge — OBS overlays

Control page + OBS display for the Jomboy Media Football "Pinpoint" game, built on the same rules as
[jomboytrivia.com/#nfl](https://www.jomboytrivia.com/#nfl).

**The game:** a ranked Top-N list (usually 100). Name a player on it and you score his rank — #99 is worth
99 points, #1 is worth 1, so the deep cuts pay. Name someone who isn't on the list and it's a strike.
Three strikes and you're out. Naming the very last player on the list is a **PINPOINT**.

## Files
| file | what |
|---|---|
| `index.html` | control page (producer) |
| `display.html?room=pinpoint` | OBS browser source, 1920×1080, transparent |
| `pp.js` / `pp.css` | shared list math, renderer, transport |
| `fpdata.js` | jomboytrivia.com Football Pinpoint stats (QB/RB/WR/TE, 1932→now) + photo ids |
| `players.js` | every NFL player (nflverse) for photos, search and custom lists |

## Running a show
1. Open `index.html`. Pick a list:
   - **Jomboy Trivia**: any NFL Daily (Top 100) or Mini (Top 10) list, pulled live from the site.
   - **Build**: your own list from the same stats (stat, years, AFC/NFC/teams, positions, Top 10/25/50/100).
   - **Upload**: paste or drop a CSV, e.g. `rank, name, value`, `name, value` or just names in order.
     Use this for anything the stats file doesn't cover (sacks, defenders, coaches…). **Save** keeps it in the library.
2. Set the contestant names and colours, strikes (1/2/3/5/unlimited) and turn order (snake or in order).
3. **Copy OBS URL** → add a Browser Source, 1920×1080. The control and OBS sync through the Jomboy relay
   (`room` must match).
4. Type a name and press Enter. Suggestions show `#73 ON LIST`, `NOT ON LIST` or `GUESSED`.
   - On the list: the card pops with the photo, value, rank and points, and the score goes up.
   - Not on the list: a strike box fills and an X card shows where the player actually ranks (e.g. #134).
   - A misspelled name that isn't in the database asks for a second Enter before it gives a strike.
   - Already named, or an ambiguous last name: no strike, same as the site.
5. Clicking a row in the answer key also awards it to whoever is picking.

**Rank reveal:** a correct pick puts the card up with the rank hidden — and the points held back on the scoreboard — until
you press **★ Reveal rank** (or the spacebar); the rank then star-wipes in with a whoosh. Switch to *auto* (1.8s) or *show with the card*
under **Rank reveal & sounds**, where you also pick which of the 25 whooshes (in `sfx/`) plays for the card and the wipe.
OBS: tick *Control audio via OBS* on the browser source to hear them; add `&mute` to the display URL to silence it.

Keys (outside the text box): `Space` (or `R`) reveal rank — Space also works from an empty name box · `C` card · `S` scoreboard · `X` strike boxes · `T` turn arrow · `B` full board ·
`←/→` change picker · `U` undo · `Enter` or `/` jumps to the name box.

## Fonts
Every piece of on-screen text has its own font dropdown (139 fonts: 125 Google Fonts loaded on demand, your Adobe kit, installed PRIMETIME/Designer, Mac system fonts) under **Fonts** on the control page (scoreboard names, scores,
+points/OUT, title bar; card name, stat number, small labels, rank, team tags, contestant tag, PINPOINT; board title/names). Adobe Fonts (kit `lxl2pkq`): Gothic Open Shaded, Roboto,
Roboto ExtraLight. **PRIMETIME** (with ten drop shadows) and **Designer** are *not* in this repo — the PRIMETIME licence is
personal-use only and forbids sharing the file — so install them on the control and OBS computers (double-click → Install).
The free PRIMETIME has no digits (every number is the Hypefonts logo), so use it for names and Designer for scores.

## Whooshes
Under the preview, click a numbered chip to choose (and hear) the whoosh for the card coming in and for the rank wipe;
🔀 picks a different one each time; right-click a chip to just listen.

## Layout
Scores can be fixed by hand: hover a contestant on the control page for −10 / −1 / +1 / +10 and ✎ (type a score).
Layout → Scoreboard also has *Numbers %* and *Names %*. The full board can be dragged on the preview (or Layout → Full board X/Y/size).

Open **Layout — sizes & positions** on the control page. Drag the card, scoreboard or strike boxes on the
preview to move them, scroll over one to resize it, or use the S/M/L/XL buttons and the sliders. The strike
boxes follow the scoreboard unless you untick that box. Layout is saved in the browser and sent to OBS.

**Inside the card:** Layout → *Inside the card* moves and sizes each piece of the card — player name, stat number, stat
label, rank badge, team tags, contestant tag, Rare find, PINPOINT banner and the player photo. Pick a piece and use the
sliders, or tick *Move pieces inside the card* and drag them on the preview (scroll to size).

**Whoosh timing:** every whoosh builds up before it hits, so the app starts each one partway in so its loudest moment
lands as the card settles / the star opens. *Timing* nudges that earlier or later for OBS's own audio delay; *Also play
them on this page* lets you check against the preview.

## Photos
- As soon as a list is chosen, every player's photo is found and loaded (control and OBS display both), so cards pop instantly.
- **Check photos / step through cards** opens Photo check: every player on the list as a card. ← → to move, *Next source*
  to cycle the real photos available (NFL.com, ESPN, Wikipedia), paste a link, choose or drop a file, switch the fit
  (cutout / fill the frame), *No photo*, or *Back to automatic*. Red outline = no photo found, green = chosen by you.
- Every photo found or chosen is saved to this browser's **photo library** and reused next time. Export / import it
  from the Data section to move it to another computer.
- A card never airs before its photo loads. Real photos only — nothing is ever generated. No photo = a plain silhouette.

## Refreshing stats
**Data → Refresh stats from jomboytrivia.com** downloads the site (~25 MB) and keeps the new numbers in
this browser. Daily lists are always recomputed from the current stats, the same way the site does it.
