# Detective Nowhere — Opening Build Tutorial (Sim KR-00)

A small playable build that tests every core mechanic from the Phase Three design bible in one controlled space: a two-floor apartment block, a rear courtyard, **one live event** (the sweep drill), and a **mock investigation** (*The Quiet Tenant*).

Stack, per the bible: **Three.js / WebGL + TypeScript + JSON content + HTML/CSS UI** (Vite). Cedric is the real **Cedric Farsight V2** GLB from the A02 three-view pack. It has no skeleton, so hip and shoulder pivots are added at runtime to make him walk.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 13 unit tests: clock, XP/GP math, seeded RNG, content integrity, map layout
npm run build      # type-check + production bundle in dist/
```

## The mock case
Corin Ashe (Apt 2B) has been missing since 13:00. Find out where he was taken, by whom, and whether he was alive, then prove each answer with evidence in the HoloBand **Case Report**.

**Canon note:** the training NPCs (Tamsin, Pim, Brun, Corin, Dax, Warden Sato, drill crew B1/B2) were made up for this simulation. They are not canon cast. The sim copies the *mechanics* of P001–P004 and P012 without spoiling them.

| Tutorial pivot | Mirrors | Branches |
|---|---|---|
| T01 The Quiet Tenant | PIVOT_02 | Trust-gated witness · timed witness (leaves 17:00, seeded 50/50) · Suggestion at the desk · both videos combine into a link |
| T02 Apartment 2B | PIVOT_03 | Hack (failure locks the terminal and halves the clock) · deep search (each search costs clock time) · leave early (permanent lock) · hide · firefight |
| T03 Sweep Drill (**the event**) | PIVOT_04 | Capture → Mimic · scalpel kill → Mimic · two right answers → window escape · open combat → dodge QTE (fail = checkpoint reload) |
| T04 The Yard | P05/06 convergence | Mimic disguise plus the crew code · crouch through the fence gap · Suggestion · force it |
| T05 The Runner | 2.5D side view | Catch him (full ledger) or he escapes (torn scrap, plus a lock) |
| T06 Case Report | Evidence-gated ending | Each answer is graded as proven, a hunch, or wrong |

## Mechanics covered (22 training directives, tracked in-game)
Isometric movement · interaction · dialogue with gated options · trust · timed witness · Quantum Art (Suggestion, CST cost, Mind-node gate) · HoloBand (Case/mission graph, Evidence, Map with 5 knowledge-gated scales, Items, Contacts, Nodes, Skills, Report, System) · HoloBand top-down scan view · close-up evidence inspector (rotate to find hidden details) · first-person terminal hack · deep search under time pressure · stealth with wall-clipped vision cones, crouch, and hiding spots · takedowns (capture or scalpel) · Mimic Device (a copied face does not come with the person's codes) · combat (scalpel, pistol, dodge) · dodge QTE with checkpoint reload · 2.5D chase · permanent lockouts · XP 70/30 node split and 3 GP per 10 XP (cumulative) · rank and four skill trees · quick save/load, checkpoints · deterministic seeds · keyboard/mouse and **Xbox controller** (menus included).

## Controls
| | Keyboard / Mouse | Xbox |
|---|---|---|
| Move | WASD | Left stick |
| Interact / confirm | E | A |
| Sneak (toggle) | C | LB |
| Scalpel | F | X |
| Fire / aim | R or LMB / mouse | RT / right stick |
| Dodge | Space | B |
| HoloBand scan view | Q | Y |
| HoloBand menu | Tab | View |
| Mimic (scan / cycle) | M | RB |
| Directives list | H | R3 |
| Save / Load | F5 / F9 | HoloBand → System |

## Layout
`content/tutorial.json` holds NPCs, dialogue, evidence, pivots, deduction questions and directives, using the Phase 3 schema style. `src/core` holds the clock, RNG and save state; `src/player` holds progression; `src/world` holds maps, level, actors and AI; `src/render` holds the pixel pipeline and props; `src/ui` holds the HUD, dialogue, HoloBand, inspector, terminal and QTE; `src/modes/chase.ts` is the side-view chase; `src/game.ts` is the orchestrator.

## Opening cinematic
**New Game** opens with a ~90-second in-engine cinematic of Cedric's backstory (surgeon → the patient he lost → blamed → his family taken → a year hunting the Coin), a no-spoiler gameplay montage, and his arrival in Zixel to meet Elias Venn. Rewatch it from the title screen. Script, timings and open questions: [`docs/OPENING_SCRIPT.md`](docs/OPENING_SCRIPT.md). Export it to MP4 with `node tools/export_intro.cjs opening.mp4`.

## Planet: Ryzen-5 (travelable overworld)
From the title screen choose **Travel Ryzen-5**, or use HoloBand → MAP → PLANET → *Open the overworld*. Cedric travels the whole planet in 3D at true scale: roads, open country and mountains move at different speeds, water needs a ferry or airship, and the world clock advances with distance. The HoloBand PLANET map adds layers, a route planner with **Set course** (auto-travel), trade corridors and a 3D globe. Details, method and open questions are in [`docs/RYZEN5_WORLD.md`](docs/RYZEN5_WORLD.md).

## Placeholders / open items
- Node thresholds, rank curve, skill costs, CST values and damage numbers are **tuning placeholders** until the handbook numbers are applied (bible §15 OPEN).
- The 1 km and City map scales are intentionally knowledge-gated with no data in this sim.
- NPCs are low-poly stand-ins. Only Cedric uses production art.
