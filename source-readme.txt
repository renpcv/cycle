CYCLE - SOURCE CODE
===================

An image wheel you can turn with hand gestures, running in a web browser.
This download holds the same tool in two ready-to-use forms. The page itself
(the wheel, the gestures, the captions) is identical in both. Both open with
10 placeholder images; load your own on the page with "Choose image folder..."
or "Are.na channel...". They only differ in how they are run.


local/  RUN IT ON YOUR OWN COMPUTER
-----------------------------------
Best for: exhibitions and workshops, or using it without putting anything online.

1. Install Node.js (free, from https://nodejs.org). Any recent version works.
2. Start it:
   - Windows: double-click start.bat
   - Mac:     double-click start.command
              (the first time, macOS may block it: right-click it, choose Open, then Open again)
   - Other:   open a terminal in the local folder and run  node serve.mjs
   Your browser opens http://localhost:8080. Keep the black terminal window open
   while you use the page. Close it to stop.


web/  PUT IT ONLINE
-------------------
Best for: sharing a link, so anyone can open it without installing anything.

Upload the contents of the web folder to any static web host, for example:
- GitHub Pages: create a repository, upload the files, then turn on
  Settings > Pages > Deploy from a branch.
- Netlify: drag the web folder onto https://app.netlify.com/drop

The page has a "Download source code" link. On your copy it needs this zip:
put cycle-source.zip in the web folder next to index.html, or the link won't work.


WHAT'S THE SAME IN BOTH
-----------------------
- Load any images on the page: "Choose image folder..." (images stay on the
  computer, never uploaded), drag a folder onto the page, or paste a public
  Are.na channel link.
- A spreadsheet (CSV, Excel or LibreOffice) in a chosen folder adds titles and
  information under the enlarged image. It needs one column containing the
  filename of each image.
- The camera works on http://localhost (local) and on https:// addresses (web).
  It won't work if you open index.html directly as a file.
- Both need an internet connection: the 3D and hand-tracking libraries load
  from public servers.
- Works best in Chrome or Edge.


USING THE PAGE
--------------
Keyboard: 1-9 pick a setting, left/right arrows adjust it (Shift for bigger
steps), R resets it, H hides or shows the settings, G hides or shows the
gesture notes next to the video.

Hands (click "Start camera" first):
- Gestures start locked. Show an open palm for 3 seconds to unlock (and again to lock).
- Hold thumb and index finger wide apart and twist like a big dial to turn the wheel.
- Bring them closer for finer movement. Touch them to pause. This also allows
  you to reposition your hand and keep turning.
- Hold an open palm for over 5 seconds to show these gesture instructions
  next to the video.


CHANGING IT
-----------
Everything is plain HTML, CSS and JavaScript, so no build step is needed.
Edit a file, then reload the page.
- style.css          colours, sizes, layout
- js/params.js       wheel settings and their default values
- js/hands.js        gesture tuning (the GESTURE settings at the top)
- js/wheel.js        the 3D wheel
- js/images.js       loading images (folders, Are.na)
- js/captions.js     spreadsheet captions
- js/main.js         ties it all together

Hand icon: Lucide (lucide.dev), ISC licence.
