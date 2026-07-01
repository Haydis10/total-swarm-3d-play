# Total Swarm Prototype

A mobile-first browser prototype now rebuilt around a real-time `Three.js` 3D scene.

## Run it

Open [index.html](/C:/Users/CHayd/Documents/Codex/2026-07-01/i-keep-seeing-this-game-on/index.html) in a modern browser, or serve the folder locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open `http://localhost:4173/`.

To publish the current build to the live GitHub Pages site in one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-public.ps1
```

You can jump to a specific difficulty with a query param:

```text
http://localhost:4173/?level=1
http://localhost:4173/?level=100
```

## Controls

- Tap or drag left/right inside the playfield to move across the three lanes.
- Your squad auto-fires down the street.
- Green pickups recruit more shooters.
- Blue progression increases weapon tier and fire rate.
- Combat segments feed into lane-choice gates.
- Each level ends with a 3D boss fight.
- Red enemies that reach the squad remove shooters.

## Main tuning points

Game balance and scene logic live in [game.js](/C:/Users/CHayd/Documents/Codex/2026-07-01/i-keep-seeing-this-game-on/game.js):

- `getLevelProfile()` for level pacing
- `createStreet()` for the 3D environment
- `rebuildPlayerFormation()` for growing the squad
- `spawnCombatObject()` / `spawnGate()` / `spawnBoss()` for encounter flow
- `updateCombat()` / `updateGates()` / `updateBoss()` for phase progression
