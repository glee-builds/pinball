# Comet Alley Pinball

A one-table pinball game for iPhone Safari. One HTML file, no build step, no accounts.

Play: https://glee-builds.github.io/pinball/

## Play

- Touch the left or right half of the table to flip.
- Hold anywhere, then let go, to launch. A longer hold is a harder launch.
- Tap **Start game** first. Sound only begins after that tap.

What to aim for:

- Light all three top lamps to raise the multiplier (up to x5). Lighting them also recruits Tide.
- Shoot the two ramps. Shoot the Skyline Ramp on the left or the Rooftop Run on the right, hard enough to climb. Either ramp recruits Kite. A weak shot stalls and rolls back out. The entrance arrow pulses when that ramp is a shot worth taking.
- Make both ramps within six seconds for a Team Relay bonus.
- Drop the ball into the Hideout on the left to recruit Ember. It also gives a mystery prize about every 20 seconds of play, and the star on it shows when one is ready.
- Recruit all three heroes of The Alley Guard (Kite on either ramp, Ember in the Hideout, Tide with the top lamps) to start a showdown with Baron Gloom. Bumpers and drop targets hit for 1, side targets, the Hideout and the Skyline Ramp for 2, the Rooftop Run and a finished drop bank for 3. Beat him for 25,000 points. The heroes reset after the showdown.
- Each hero also brings a mission, ready once that hero is recruited. Drop a ball in the Hideout to start the next ready mission: Sky Patrol (ramp crests), Fire Drill (bumper hits) or Flood Gates (drop targets). Finish it before time runs out for 8,000 points. Only one mode runs at a time, and a mission that runs out becomes ready again.
- Finish all three missions and win one showdown to light Last Stand. The next Hideout capture starts it: three balls, all scores tripled, and every ramp is a super jackpot. When it ends, the heroes and missions reset so you can earn it again.
- The display above the table shows what is going on: the mission tiles and the best next shot, mission progress, Baron Gloom's health, or the Last Stand clock. Big callouts play there too, so the table stays clear. The Hideout shows an emblem and a spinning ring when a capture would start a mission or Last Stand.
- Hit both side targets to light the lock. While it is lit, the Hideout and both ramps lock a ball. Lock two balls for Team-Up Multiball: three balls, and all scores double until one is left. The Rooftop Run is a jackpot shot during multiball. Locked balls show in the score rail.
- Knock down all three drop targets in the middle for a bank bonus. They stand back up a moment later, and the bank also re-arms the kickback.
- Roll through the inlanes for small points. The left outlane has a kickback: while its arrow is lit, a ball that rolls down that lane is kicked back up once. It re-arms with each new ball and after a drop bank. A ball lost down either outlane still scores 500.
- Any ball crossing the spinner at the Rooftop Run entrance spins it, and every half turn scores.
- Gloom's Lair: when a Rooftop Run crest is diverted, the ball rides a wire up to Baron Gloom's raised hideout above the table. Light all three guards to light the vault, then drop a ball in it for the jackpot. Fall through the exit and the ball rides back down to the left lane.
- The Gloom Shield: during a showdown an energy barrier blocks the Rooftop Run entrance. Hit it three times to smash it. Each hit also hurts Baron Gloom.
- Tide's Undertow: once Tide is recruited, the whirlpool between the flippers catches the next ball that drops through it, holds it a moment, then flings it back up the table.
- Chain hits quickly to build a combo. Chain major shots (ramps, Hideout, the lair) within 5 seconds for a COMBO counter. The same ramp twice is a Double Run, the Hideout then a ramp is an Ember Rush, and three ramps in 8 seconds is a Skyway.
- Extra ball: finish your first mission or win your first showdown to light it, then drop a ball in the Hideout to collect it. If you drain with one banked, SHOOT AGAIN lights by the plunger and you replay the same ball.
- Rooftop Chase: complete two drop banks to light it, then drop a ball in the Hideout. The table freezes and a rooftop run takes over. Tap the left or right half of the screen to dodge falling hazards. Three hits or 20 seconds ends it, and every dodge scores.
- Super skill shot: make a ramp crest within 4 seconds of a plunger launch, before the ball touches a bumper, for 25,000.
- Match: when the game ends, the two-digit match spins. If its tens digit equals the tens digit of your score, you win the match.
- Catch the mystery star when it appears. There are 16 surprises to find, including a secret run down the Rooftop Run lane the wrong way and the super skill shot.

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
- The second script handles touch input, drawing, sound, records, and the start and game-over card. The table is a 2D canvas tilted with CSS, with raised parts faked by shifting them up the table over a soft shadow.

Rules for changes: keep it one file, keep the sim free of page access, and do not add a service worker or web app manifest.
