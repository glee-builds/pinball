# Comet Alley

A single-file pinball game for one player, built for iPhone Safari (and works on a computer with the keyboard).

Play: https://glee-builds.github.io/pinball/

## How to play

- Touch the left or right half of the table to flip that flipper.
- Hold anywhere, then let go, to launch the ball. A longer hold (up to about a second) launches harder.
- Keyboard on a computer: Left Arrow or Z for the left flipper, Right Arrow, M or / for the right flipper. Hold and release Space to launch.
- Sound starts after you tap Start.

Rules:

- You get 3 balls. A ball saver gives the ball back if it drains soon after launch.
- Light all 3 top lamps to raise the multiplier, up to x5.
- Hit both side targets to start a 3-ball multiball. Hitting both again during multiball scores a jackpot.
- Quick chains of hits build a combo.
- A mystery star appears on the table now and then. Catch it for one of 7 random prizes.
- There are 11 surprises to find in total.

Records (your top 5 scores, best combo, and more) are saved on the device in the browser's localStorage. Clearing Safari website data erases them.

## Add it to your iPhone home screen

1. Open the Play link above in Safari.
2. Tap the Share button.
3. Tap Add to Home Screen.
4. Turn off "Open as Web App."
5. Tap Add.

With that switch off, the icon opens the game in normal Safari, which is what the game is built and tested for.

## Run the test

The test needs Node.js. There is no install step.

    node test/sim.test.js          # 40 seeded games (default)
    node test/sim.test.js 200      # 200 games
    node test/sim.test.js 1 17     # replay only seed 17

The test pulls the `<script id="sim">` block out of index.html and runs it headless with a seeded random generator and random flipper input. A game fails if a ball leaves the table above y = 640, if any value becomes NaN, or if a game runs past 600 simulated seconds.

## Project layout and ground rules

- `index.html`: the whole game. Inline CSS and two inline scripts. Google Fonts is the only outside load. No build step.
- `test/sim.test.js`: the headless sim test.

Ground rules:

- Keep it one HTML file with no build step.
- Keep the sim script free of DOM access, so the test can run it.
- No service worker and no web app manifest.
- Seeded randomness belongs in the test only.
