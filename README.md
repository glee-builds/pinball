# Comet Alley Pinball

A one-table pinball game for iPhone Safari. One HTML file, no build step, no accounts.

Play: https://glee-builds.github.io/pinball/

## Play

- Touch the left or right half of the table to flip.
- Hold anywhere, then let go, to launch. A longer hold is a harder launch.
- Tap **Start game** first. Sound only begins after that tap.

What to aim for:

- Light all three top lamps to raise the multiplier (up to x5). Lighting them also recruits Tide.
- Ride the Rooftop Run, the lane beside the shooter lane, to recruit Kite. The arrow pulses when it is the shot to take.
- Drop the ball into the Hideout on the left to recruit Ember. It also gives a mystery prize about every 20 seconds of play, and the star on it shows when one is ready.
- Recruit all three heroes of The Alley Guard to start a 45 second showdown with Baron Gloom. His health bar sits under the score. Bumpers hit for 1, side targets and the Hideout for 2, the Rooftop Run for 3. Beat him for 25,000 points. The heroes reset after the showdown.
- Hit both side targets to start a three-ball multiball. All scores double until one ball is left. The Rooftop Run is a jackpot shot during multiball.
- Chain hits quickly to build a combo.
- Catch the mystery star when it appears. There are 13 surprises to find, including a secret run down the Rooftop Run lane the wrong way.

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

## How changes reach the live site

- Every push and pull request runs the test on GitHub.
- When a change lands on `main` and the test passes, GitHub copies `main` to the `gh-pages` branch, and the site at https://glee-builds.github.io/pinball/ updates about a minute later.
- If the test fails, the site stays as it was.

## How the code is laid out

- `index.html` holds everything.
- `<script id="sim">` is the physics and rules, with no page access, so the test can run it in Node.
- The second script handles touch input, drawing, sound, records, and the start and game-over card.

Rules for changes: keep it one file, keep the sim free of page access, and do not add a service worker or web app manifest.
