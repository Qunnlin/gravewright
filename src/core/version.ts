/** The game's semantic version — the single source of truth.
 *
 *  Rules (see CLAUDE.md → Versioning & changelog):
 *   - patch: fixes and balance nudges
 *   - minor: new features or content
 *   - major: save-breaking or pillar-level changes
 *  A release bumps this, package.json's version, and turns CHANGELOG.md's
 *  [Unreleased] section into a dated release heading. The Settings tab
 *  displays it. (GameState.v is the SAVE schema version — unrelated.) */
export const GAME_VERSION = '1.4.1';
