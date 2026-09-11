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
