# Comet Alley Pinball

A one-table pinball game for iPhone Safari. One HTML file, no build step, no accounts.

## Play

- Touch the left or right half of the table to flip.
- Hold anywhere, then let go, to launch. A longer hold is a harder launch.
- Tap **Start game** first. Sound only begins after that tap.

What to aim for:

- Light all three top lamps to raise the multiplier (up to x5).
- Hit both side targets to start a three-ball multiball. All scores double until one ball is left.
- Chain hits quickly to build a combo.
- Catch the mystery star when it appears. There are 11 surprises to find.

Your top scores and records are saved in the browser on your phone. Clearing Safari data clears them.

## Put it on your iPhone home screen

1. Open the game URL in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Turn off **Open as Web App**, so the icon opens in regular Safari. Sound has been more reliable there.

## Run the test

```
node test/sim.test.js          # 40 seeded games
node test/sim.test.js 200      # 200 games
node test/sim.test.js 1 17     # replay only seed 17
```

By default it plays 40 seeded games with random flipper input and fails if a ball escapes the table, a value goes NaN, or a game never ends. Run it after any gameplay change.

## How the code is laid out

- `index.html` holds everything.
- `<script id="sim">` is the physics and rules, with no page access, so the test can run it in Node.
- The second script handles touch input, drawing, sound, records, and the start and game-over card.

Rules for changes: keep it one file, keep the sim free of page access, and do not add a service worker or web app manifest.
