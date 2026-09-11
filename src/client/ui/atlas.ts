/**
 * Sprite atlas shared by the HUD and the menus: an 8x8 grid of cells, cut out
 * with PBUiBackground's `uvs` instead of one png per icon.
 *
 * Coordinates are the spreadsheet-style cells of the source image, 0-based from
 * the top-left (A1 = col 0, row 0).
 */

const ATLAS = 'assets/images/atlas_01.png'
const ATLAS_GRID = 8

/**
 * Region of the atlas as a uiBackground. `cols`/`rows` are how many cells wide
 * and tall the sprite is, so the logo spanning A7:H8 is (0, 6, 8, 2).
 */
export function atlasIcon(col: number, row: number, cols = 2, rows = cols) {
  const s = 1 / ATLAS_GRID
  const u0 = col * s
  const u1 = (col + cols) * s
  const v1 = 1 - row * s
  const v0 = 1 - (row + rows) * s
  return {
    textureMode: 'stretch' as const,
    texture: { src: ATLAS },
    uvs: [u0, v0, u0, v1, u1, v1, u1, v0]
  }
}

const LEVEL_SELECTOR = 'assets/images/level_selector.png'

/**
 * Level preview art on its own 8x8 sheet: each one is 4 cells wide by 2 tall,
 * so index 0 is A1:D2 and index 1 is E1:H2. 4 cells by 2 is 2:1 - see LEVEL_ART_RATIO.
 */
export function levelThumb(index: number) {
  const s = 1 / ATLAS_GRID
  const u0 = index * 4 * s
  const u1 = (index * 4 + 4) * s
  const v1 = 1
  const v0 = 1 - 2 * s
  return {
    textureMode: 'stretch' as const,
    texture: { src: LEVEL_SELECTOR },
    uvs: [u0, v0, u0, v1, u1, v1, u1, v0]
  }
}

/** Width / height of the level art (4 cells wide, 2 tall): keep it to avoid stretching. */
export const LEVEL_ART_RATIO = 2
