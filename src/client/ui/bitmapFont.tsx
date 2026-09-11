import ReactEcs, { UiEntity, type UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { PRIME_FONT_FNT_SOURCE } from './fontSource'

// Bitmap-font rendering from a spritesheet in the AngelCode BMFont text format (.fnt). DCL UI
// can't load custom fonts, so each character is drawn as its own UiEntity, cropping the glyph out
// of the spritesheet via PBUiBackground's `uvs` field - same technique as the HUD's atlas icons.
// Ported from monster-recon's bitmapFont.tsx.

interface Glyph {
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
}

export interface BitmapFont {
  lineHeight: number
  scaleW: number
  scaleH: number
  glyphs: Map<number, Glyph>
  kernings: Map<string, number>
  // Native-unit vertical nudge added to every glyph's yoffset before scaling - see
  // computeVerticalCenterOffset below for why this is needed.
  verticalOffset: number
}

// BMFont's lineHeight is the font's nominal ascent+descent, not the pixel range the glyphs
// actually use, so centering a lineHeight box can visually center empty padding instead of the
// ink. This measures the real top/bottom ink extent across letters+digits and returns a constant
// that re-centers it within lineHeight.
function computeVerticalCenterOffset(glyphs: Map<number, Glyph>, lineHeight: number): number {
  let top = Infinity
  let bottom = -Infinity
  for (const [id, g] of glyphs) {
    const isAlphanumeric = (id >= 48 && id <= 57) || (id >= 65 && id <= 90) || (id >= 97 && id <= 122)
    if (!isAlphanumeric || g.width === 0 || g.height === 0) continue
    top = Math.min(top, g.yoffset)
    bottom = Math.max(bottom, g.yoffset + g.height)
  }
  if (!isFinite(top)) return 0
  return (lineHeight - (bottom - top)) / 2 - top
}

// Parses the AngelCode BMFont text format. Only the fields this renderer needs are extracted
// (common/char/kerning lines).
function parseFnt(fnt: string): BitmapFont {
  const commonMatch = fnt.match(/common lineHeight=(-?\d+).*scaleW=(\d+) scaleH=(\d+)/)
  if (!commonMatch) throw new Error('parseFnt: missing "common" line')
  const [, lineHeight, scaleW, scaleH] = commonMatch

  const glyphs = new Map<number, Glyph>()
  const charRegex =
    /char id=(\d+)\s+x=(-?\d+)\s+y=(-?\d+)\s+width=(-?\d+)\s+height=(-?\d+)\s+xoffset=(-?\d+)\s+yoffset=(-?\d+)\s+xadvance=(-?\d+)/g
  for (const m of fnt.matchAll(charRegex)) {
    const [, id, x, y, width, height, xoffset, yoffset, xadvance] = m
    glyphs.set(Number(id), {
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
      xoffset: Number(xoffset),
      yoffset: Number(yoffset),
      xadvance: Number(xadvance)
    })
  }

  const kernings = new Map<string, number>()
  const kerningRegex = /kerning first=(\d+)\s+second=(\d+)\s+amount=(-?\d+)/g
  for (const m of fnt.matchAll(kerningRegex)) {
    const [, first, second, amount] = m
    kernings.set(`${first}:${second}`, Number(amount))
  }

  const lineHeightNum = Number(lineHeight)
  return {
    lineHeight: lineHeightNum,
    scaleW: Number(scaleW),
    scaleH: Number(scaleH),
    glyphs,
    kernings,
    verticalOffset: computeVerticalCenterOffset(glyphs, lineHeightNum)
  }
}

export const PRIME_FONT: BitmapFont = parseFnt(PRIME_FONT_FNT_SOURCE)
// White glyphs. uiBackground.color tints them on desktop, but the tint is NOT honored on mobile
// (confirmed in monster-recon): a fixed non-white color that must work on mobile needs a
// pre-tinted copy of this png.
export const PRIME_FONT_IMAGE = 'assets/images/font.png'
// Same glyph layout, pre-tinted yellow: the highlight color that also works on mobile.
export const PRIME_FONT_IMAGE_YELLOW = 'assets/images/font-yellow.png'
// Pre-tinted red: the danger color (COLORS.danger) on every platform.
export const PRIME_FONT_IMAGE_RED = 'assets/images/font-red.png'

// uvs go bottom-left, top-left, top-right, bottom-right (clockwise), per PBUiBackground. The .fnt's
// x/y are pixel coords from the sheet's top-left, so v (bottom-up) is the inverse of y (top-down).
function getGlyphUvs(glyph: Glyph, font: BitmapFont): number[] {
  const u1 = glyph.x / font.scaleW
  const u2 = (glyph.x + glyph.width) / font.scaleW
  const vTop = 1 - glyph.y / font.scaleH
  const vBottom = 1 - (glyph.y + glyph.height) / font.scaleH
  return [u1, vBottom, u1, vTop, u2, vTop, u2, vBottom]
}

interface BitmapTextProps {
  text: string // '\n' starts a new line
  fontSize: number // rendered row height in px; scale is fontSize / font.lineHeight
  font?: BitmapFont
  image?: string
  color?: Color4 // runtime tint - desktop only, see PRIME_FONT_IMAGE
  uiTransform?: UiTransformProps // merged onto the outer container (margin, borders, etc.)
  align?: 'left' | 'center' | 'right' // horizontal alignment of each line; only matters with >1 line
  // Word-wrap width in px. There's no real text layout here (each char is its own quad), so this
  // pre-splits `text` into lines that each fit, greedily by word. Long unbreakable words still
  // overflow one line as-is.
  maxWidth?: number
}

function measureLineWidth(line: string, font: BitmapFont, scale: number): number {
  const chars = Array.from(line)
  const spaceAdvance = font.glyphs.get(32)?.xadvance ?? 0
  let width = 0
  for (let i = 0; i < chars.length; i++) {
    const id = chars[i].codePointAt(0) ?? 32
    const glyph = font.glyphs.get(id)
    const prevId = i > 0 ? chars[i - 1].codePointAt(0) : undefined
    const kerning = prevId !== undefined ? (font.kernings.get(`${prevId}:${id}`) ?? 0) : 0
    width += ((glyph?.xadvance ?? spaceAdvance) + kerning) * scale
  }
  return width
}

// Greedily wraps each existing line so no rendered line exceeds maxWidth, breaking only at spaces.
function wrapText(text: string, font: BitmapFont, scale: number, maxWidth: number): string {
  return text
    .split('\n')
    .map((paragraph) => {
      const words = paragraph.split(' ')
      const wrapped: string[] = []
      let current = ''
      for (const word of words) {
        const candidate = current === '' ? word : `${current} ${word}`
        if (current !== '' && measureLineWidth(candidate, font, scale) > maxWidth) {
          wrapped.push(current)
          current = word
        } else {
          current = candidate
        }
      }
      wrapped.push(current)
      return wrapped.join('\n')
    })
    .join('\n')
}

// One line's worth of glyph quads. Kerning pairs are applied as a margin-left nudge on the
// affected char. Characters missing from the font render as a space.
function BitmapTextLine(props: {
  key?: string | number
  line: string
  font: BitmapFont
  image: string
  scale: number
  rowHeight: number
  color?: Color4
}) {
  const { line, font, image, scale, rowHeight, color } = props
  const chars = Array.from(line)
  const spaceAdvance = font.glyphs.get(32)?.xadvance ?? 0

  return (
    <UiEntity uiTransform={{ flexDirection: 'row', height: rowHeight, flexShrink: 0 }}>
      {chars.map((char, i) => {
        const id = char.codePointAt(0) ?? 32
        const glyph = font.glyphs.get(id)
        const prevId = i > 0 ? chars[i - 1].codePointAt(0) : undefined
        const kerning = prevId !== undefined ? (font.kernings.get(`${prevId}:${id}`) ?? 0) : 0

        if (glyph === undefined || glyph.width === 0 || glyph.height === 0) {
          const boxWidth = (glyph?.xadvance ?? spaceAdvance) * scale
          return <UiEntity key={i} uiTransform={{ width: boxWidth, height: rowHeight, flexShrink: 0 }} />
        }

        return (
          <UiEntity
            key={i}
            uiTransform={{
              width: glyph.xadvance * scale,
              height: rowHeight,
              flexShrink: 0,
              margin: { left: kerning * scale }
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { left: glyph.xoffset * scale, top: (glyph.yoffset + font.verticalOffset) * scale },
                width: glyph.width * scale,
                height: glyph.height * scale
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: image },
                uvs: getGlyphUvs(glyph, font),
                color
              }}
            />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

export function BitmapText({
  text,
  fontSize,
  font = PRIME_FONT,
  image = PRIME_FONT_IMAGE,
  color,
  uiTransform,
  align = 'left',
  maxWidth
}: BitmapTextProps) {
  const scale = fontSize / font.lineHeight
  const rowHeight = font.lineHeight * scale
  const wrappedText = maxWidth !== undefined ? wrapText(text, font, scale, maxWidth) : text
  const lines = wrappedText.split('\n')
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

  return (
    <UiEntity uiTransform={{ flexDirection: 'column', alignItems, flexShrink: 0, ...uiTransform }}>
      {lines.map((line, i) => (
        <BitmapTextLine
          key={i}
          line={line}
          font={font}
          image={image}
          scale={scale}
          rowHeight={rowHeight}
          color={color}
        />
      ))}
    </UiEntity>
  )
}
