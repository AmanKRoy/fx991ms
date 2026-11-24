# fx-991MS web emulator

Static web app that emulates the CASIO fx-991MS for exam practice on a phone.
No build step and no dependencies.

- Run locally: `python3 -m http.server 8791` in this folder, then open http://localhost:8791/
- Tests: `node --test tests/`
- Install on a phone: host the folder over HTTPS (for example GitHub Pages), open it in
  Chrome or Safari, then use "Add to Home screen". It works offline after the first load.
- After changing any file, bump `VERSION` in `sw.js`.

Behaviour follows the CASIO User's Guides in `docs/manual/` (see `CONTRACT.md`).
The "Textbook view" strip above the calculator is a reading aid. The real fx-991MS has a
two-line linear display, which the LCD reproduces.
