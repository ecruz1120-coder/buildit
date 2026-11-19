# Opening Cinematic — "Detective Nowhere: The Coin Conspiracy" (≈92 s)

Plays automatically on **New Game**. Rewatch it from the title screen with **Watch the Opening**. Skip with Esc/E or B/A.
- **Code:** `src/modes/intro.ts` (shots and captions), `src/audio/score.ts` (synthesized score).
- **MP4 export:** `node tools/export_intro.cjs out.mp4`, with the dev server running. It renders frame-exact, so the file matches the in-game version.

The narration is Cedric's voice, shown as subtitles. Every line and timing lives in `CAPTIONS` at the top of `intro.ts`; change the text there and it updates both the game and the MP4.

| Time | Sequence | Picture | Narration / on-screen |
|---|---|---|---|
| 0:00–0:05 | Cold open | ECG trace in darkness, steady heartbeat | "They told me my hands were a gift." |
| 0:05–0:14 | Graduation | Banners, audience, Cedric in robe and mortarboard crossing the stage, diploma raised, confetti | "Top of my class. Doctor Cedric Farsight, surgeon." / "I swore an oath: no life lost that could be saved." |
| 0:14–0:27 | The surgeon years | Operating theatre (scrubs, steady monitor) → penthouse office handshake with a dignitary, awards on the wall → hands at work | "For years, I kept it." / "The powerful came to me. Governments trusted me with their own." / "I never lost one." |
| 0:27–0:40 | The patient | Officials watch from the gallery; the patient wears a gold sash; the monitor falters → flatline, red alarm; Cedric steps back and stares at his hands | "Until the one patient I could not lose." / "A government official. Every reading was right. Every cut was clean." / "He died on my table." |
| 0:40–0:49 | The fall | Holo-news headlines circle him ("SURGEON BLAMED…", "MEDICAL LICENSE REVOKED"), camera flashes, the crowd turns its back | "They needed someone to blame." / "They chose the man holding the scalpel." |
| 0:49–0:58 | The family | Warm home, family at the table → night, masked silhouettes in the doorway → empty room, a coin spinning on the floor | "My family stood by me through all of it." / "Weeks later, someone came for them." / "They left one thing behind." |
| 0:58–1:08 | The detective | Cedric in his longcoat walking through neon rain → evidence wall, every string leading to the coin | "I put down the scalpel. I picked up the trail." / "One year hunting a name that only exists in whispers: the Coin." |
| 1:08–1:11 | Match-cut | The camera pushes into the evidence wall's "RYZEN-5? / CONTACT: E. VENN" card, which blooms cyan into space | "Then, at last, the trail gave me a place." |
| 1:11–1:15 | Approach | Riding behind Cedric's transport as Ryzen-5 grows ahead; atmospheric entry heat-glow, bloom to orange | **RYZEN-5** — "My best lead in a year points to one world." |
| 1:15–1:20 | Landing | The transport descends through the Zixel night skyline onto a pad; the ramp drops and Cedric steps off toward camera | **ZIXEL · VEYRA DISTRICT** — "Zixel. A contact named Elias Venn." |
| 1:20–1:28 | What you'll do (hard cuts, 1.375 s each) | ① Sneaking past a guard's vision cone ② The Mimic Device turns Cedric into an operative ③ Shooting: dodge roll, return fire, a hit ④ Scalpel assassination from behind ⑤ A conversation with a stranger (street vendor), with the in-game dialogue panel showing a Quantum Art option ⑥ Travelling the planet: a transport flying the real Ryzen-5 overworld from Zixel toward Kitsah | MOVE UNSEEN · WEAR ANY FACE · SURVIVE THE AMBUSH · STRIKE FROM THE SHADOWS · QUESTION EVERYONE · CROSS A WORLD THAT KEEPS ITS SECRETS |
| 1:28–1:32 | Title | Cedric on the landing pad, looking out over Zixel | **DETECTIVE NOWHERE — THE COIN CONSPIRACY** — "Whoever they are — I am coming." |

## Spoiler guardrails
The opening does **not** show or hint at any of these:
- Kestrel, the Chimera research, Crosshair, or the third party.
- Elias Venn as the rogue operative. He is named only as Cedric's contact and never shown.
- The tracker implant.
- Any ending.

The official's death is presented exactly as Cedric experienced it: everything looked right, and he was blamed. It doesn't say whether it was sabotage.

## Choices I made — please confirm or change
1. **The coin calling card.** The killers leave a coin at the Farsight home. It's a visual motif that names the organization. This is new and not in the design bible.
2. **Family shown as three silhouettes** (two adults and a child), with no names or faces. Tell me who the family members are and I'll match them.
3. **The family's deaths are stated** ("someone came for them"), per your brief. The bible's Act IV beat, where records *suggest the family may be alive*, still works: it plays as a cruel false hope, then Act V confirms the deaths.
4. **The death happens off-screen.** Masked figures appear in the doorway, then the room is empty. Nothing graphic, which keeps the opening rating-friendly.
5. **No planet is named for his past.** His medical career isn't placed on any named world.
6. **The "Holonews" headline wording** and **"Doctor Cedric Farsight"** are my placeholders.

## Visual and audio notes
- Everything is built in-engine, letterboxed to 2.39:1. The cinematic renders at full resolution, so faces read clearly; the retro colour grading (posterize and dither) stays.
- Cedric uses his real V2 model, re-dressed for each era: graduation robe, surgical scrubs, dark suit, then his longcoat.
- The score is fully synthesized:
  - a warm pad for the graduation;
  - steady monitor beeps through the surgeon years;
  - a faltering rhythm, then flatline, for the patient;
  - low hits for the fall;
  - a bell for the coin;
  - rain;
  - a riser into the match-cut, then a whoosh for the atmospheric entry and a touchdown hit;
  - a 120 BPM drive under the montage, with a hit on every cut;
  - a title hit on "DETECTIVE NOWHERE".
- Narration is subtitles only. The `CAPTIONS` timings are already spaced for a voice-over if you record one.
