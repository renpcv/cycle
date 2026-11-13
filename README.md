# Cycle (web)

The TouchDesigner image wheel as a web page: Three.js for the wheel, MediaPipe for hand tracking.

## Run it

1. Install [Node.js](https://nodejs.org) (any recent version).
2. Double-click `start.bat`, or run `node serve.mjs` here and open http://localhost:8080.
3. Click **Start camera** and allow camera access.

Put images in `images/`. New files appear within a few seconds, like the TD Folder DAT.

Other image sets:
- **Choose image folder…** (or drop a folder on the page): any folder on this computer. Read in the browser, never uploaded.
  To add titles and info, put a spreadsheet in the folder (`.csv`, `.tsv`, `.xlsx`, `.xls` or `.ods`; the first one, by name, is used)
  with a column of image filenames (with or without the extension, any column position). A dialog then asks which column
  is the title and up to 4 more to show underneath the enlarged image. If no column matches the images, the images show without captions.
- **Are.na channel…**: paste a link to a public [Are.na](https://www.are.na) channel (`are.na/<user>/<channel>`).
  No account or key needed to view it. Images show in the channel's order, and new blocks appear within about 20 s.
  The address becomes `…?arena=<channel>`, so that link opens the same set.

Use Chrome or Edge. The camera only works on `http://localhost` or an `https://` address.
Needs an internet connection: Three.js and the MediaPipe model load from public CDNs.

## Controls

| Input | Effect |
|---|---|
| 1-9 | pick a value (spin, fine, ring width/length, card yaw, camera_lat (elevation), camera_azi (azimuth), zoom, focus direction) |
| ←/→ | change it (hold to repeat, Shift = 10×) |
| R | reset it |
| H | hide/show the HUD and buttons |
| thumb + index apart, twist | turn the wheel like a knob; a smaller gap moves it more finely |
| thumb + index touching | clutch: twist without moving the wheel |
| open palm held 3 s | lock / unlock hand controls (markers turn to X's) |

Values reset to their defaults (in `js/params.js`) on every reload. Gesture settings are at the top of `js/hands.js` (`GESTURE`).

## Host it online

Any static host works (GitHub Pages, Netlify, ...). Run `node build-manifest.mjs` after changing images,
so `images/manifest.json` lists them, then upload this folder.

## The source download

The page's "Download source code" link serves `cycle-source.zip`, which holds a `local/` and a `web/` copy of the tool
plus `README.txt` (from `source-readme.txt`). Rebuild it before each publish so it matches the site:

    node build-manifest.mjs && node build-zip.mjs

## Files

- `js/params.js` - adjustable values and keyboard (TD `params`, `keys_execute`, `hold_execute`)
- `js/images.js` - image loading (Folder DAT, Replicator, Movie File In)
- `js/wheel.js` - the 3D wheel and featured-card maths (Pattern CHOPs, camera rig, `focus`/`featured`)
- `js/hands.js` - camera, MediaPipe, gestures and hand overlay (`gesture_execute`, overlay patch)
- `js/main.js` - layout, featured image, HUD and the frame loop
