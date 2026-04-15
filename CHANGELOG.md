# Changelog
All notable changes to the MB (Fantasy Autobattler) prototype.

## 0.0.41 (current)
- Fix enemy mirror-avoidance so alternative unit choices replace a full placement instead of mutating a single deployed unit.
- Add deterministic headless regression checks for enemy mirror avoidance, AI loan opening, building slot rules, and diagonal in-range cooldown holds.
- Cap XP at the upgrade threshold until the unit is upgraded.
- Limit unit upgrades to once per turn for both player and enemy units.
- Add clearer upgrade UX text for capped XP and per-turn limits.

## 0.0.40
- Add Sniper unit (5g unlock/place, long range, fast attacks).
- Fix building targeting when no enemy units remain and refresh battle stall watchdog.
- Fix Archer Tower placement preview logic for building limits and slots.

## 0.0.38
- Add an E tier to the round results tier list to match the full color palette.
- Keep the Ready countdown at 180s while round results auto-advance after 30s.
- Stop enemy deployments in their own flank lanes and treat combat buildings as valid battle participants.
- Allow building placements without consuming unit placement slots.

## 0.0.37
- Show placed/limit badges above building buttons, with full/locked states for quicker scanning.
- Compress round result survivor stats into tier list rows and remove the tier list header.
- Set prep Ready timer to 180s while keeping round result auto-advance at 30s.

## 0.0.36
- Scope building limits, upgrades, and tooltips to player-owned buildings for clearer placement UX.
- Set the round prep timer to 30s and expand round results with big damage totals, percent breakdowns, and tier lists.
- Remove the Start Battle button; Ready now drives battle start with the timer.
- Fix building targeting by using a larger footprint-based hitbox so units can damage structures.
- Add the Archer Tower building with ranged attacks and a 2-per-player placement limit.

## 0.0.35
- Restore player deployment in enemy flank lanes after unlock; keep player flanks enemy-only.
- Add green flank tint + legend entry for player flanks, plus clearer flank tooltips.
- Show phase label in the round banner for faster scanning.
- Add Back to Main navigation for versioned builds (menu and in-game).
- Inject a Back to Main fallback into version snapshots during hosting prep.

## 0.0.34
- Prevent instant battle timeouts when entering a round (fixes round 1 ending immediately after long idle).

## 0.0.33
- Add round results overlay with winner highlight, survivor damage breakdown, and 10s auto-advance.
- Add large round banner above the map and refresh tooltip copy for enemy-only flank lanes.
- Restrict player placement away from flank lanes; enemy flanks remain delayed enemy-only lanes.
- Improve Gold Mine tooltip to show 1/1 placement limit when built.

## 0.0.32
- Allow Ready to skip battles when no units are deployed; apply damage from enemy units only.
- Update UX copy to clarify skip behavior and damage rules.

## 0.0.31
- Add buildings (Gold Mine, Goblin Cave) with upgrades, spawns, and income.
- Add Goblin squad unit with multi-cell placement and spawn offsets.
- Add flank-lane deployment with delayed activation.
- Add unit + building upgrade panels and upgrade-all flow.
- Add full audio system (theme, SFX, ducking, toggle).
- Add AI auto-prep + Showcase screen.
- Add hosting build pipeline and sim scripts.

Note: 0.0.13-0.0.30 are dist-only snapshots in this repo (source not tracked here).

## 0.0.12
- Add AI Showcase screen and auto-prep logic.
- Add audio toggle/SFX plumbing.
- Add version launcher with current version label.

## 0.0.09
- Introduce audio toggle in the main menu.

## 0.0.06
- Add version catalog and navigation to previous builds.

## 0.0.02
- Add XP/tier progression and stat scaling.

## 0.0.01
- Initial playable prototype (deploy/battle loop with 3 units).
