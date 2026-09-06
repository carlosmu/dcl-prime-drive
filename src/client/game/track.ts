import { Entity, GltfContainer, Material, MeshRenderer, Transform, engine } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { SPAWN, TRACK } from '../../shared/config'

/**
 * Track scenery: static road and scrolling elements.
 *
 * Nothing here creates or destroys entities after startup. Moving elements
 * are fixed-size rings that loop back to the rear once the camera passes
 * them, adding the ring's length, so there's no pool or GLB reload at any
 * point during the race.
 */

const BUILDING_MODELS = [
  'assets/models/building_01.glb',
  'assets/models/building_02.glb',
  'assets/models/building_03.glb'
]
const PYLON_MODEL = 'assets/models/track_edge.glb'
const STRIPE_MODEL = 'assets/models/street_lines.glb'

/** How far small elements are drawn. Further than this they're not distinguishable. */
const DECOR_RANGE_Z = 200

const STRIPE_SPACING = SPAWN.laneStripeEveryM
const PYLON_SPACING = 16
/** The pylon's origin is centered on Y: without this it's half buried. */
const PYLON_BASE_Y = 1.04
const BUILDING_SPACING = SPAWN.buildingEveryM

type LoopRing = {
  entities: Entity[]
  /** Total ring length: this is added to Z when it exits the rear. */
  length: number
  /** Called when a piece is recycled, to vary the scenery. */
  onWrap?: (entity: Entity, index: number) => void
}

const rings: LoopRing[] = []

export function buildTrack() {
  buildRoadSurface()
  buildNeonRails()
  rings.push(buildStripes())
  rings.push(buildPylons())
  rings.push(buildBuildings())
}

/**
 * Advances the scenery. `delta` is the meters traveled this frame.
 */
export function scrollTrack(delta: number) {
  if (delta <= 0) return
  for (const ring of rings) {
    for (let i = 0; i < ring.entities.length; i++) {
      const transform = Transform.getMutable(ring.entities[i])
      transform.position.z -= delta
      if (transform.position.z < TRACK.despawnZ) {
        transform.position.z += ring.length
        if (ring.onWrap) ring.onWrap(ring.entities[i], i)
      }
    }
  }
}

// --- Road ----------------------------------------------------------------

function buildRoadSurface() {
  const halfLength = TRACK.roadLength / 2

  const road = engine.addEntity()
  Transform.create(road, {
    position: Vector3.create(TRACK.centerX, TRACK.roadY, halfLength),
    scale: Vector3.create(TRACK.roadWidth, 0.1, TRACK.roadLength)
  })
  MeshRenderer.setBox(road)
  Material.setPbrMaterial(road, {
    albedoColor: Color4.create(0.07, 0.08, 0.11, 1),
    roughness: 0.85,
    metallic: 0
  })

  // Shoulders: fill the scene's 64 m width so there's no visible gap.
  const shoulderWidth = (64 - TRACK.roadWidth) / 2
  for (const side of [-1, 1]) {
    const shoulder = engine.addEntity()
    Transform.create(shoulder, {
      position: Vector3.create(
        TRACK.centerX + side * (TRACK.roadWidth / 2 + shoulderWidth / 2),
        TRACK.roadY - 0.02,
        halfLength
      ),
      scale: Vector3.create(shoulderWidth, 0.08, TRACK.roadLength)
    })
    MeshRenderer.setBox(shoulder)
    Material.setPbrMaterial(shoulder, {
      albedoColor: Color4.create(0.03, 0.03, 0.05, 1),
      roughness: 1,
      metallic: 0
    })
  }
}

/** Two emissive rails on the sides: they give the track its vanishing line. */
function buildNeonRails() {
  for (const side of [-1, 1]) {
    const rail = engine.addEntity()
    Transform.create(rail, {
      position: Vector3.create(
        TRACK.centerX + side * (TRACK.roadWidth / 2 - 0.15),
        TRACK.roadY + 0.12,
        TRACK.roadLength / 2
      ),
      scale: Vector3.create(0.3, 0.16, TRACK.roadLength)
    })
    MeshRenderer.setBox(rail)
    Material.setPbrMaterial(rail, {
      albedoColor: Color4.create(0.1, 0.6, 1, 1),
      emissiveColor: Color3.create(0.15, 0.75, 1),
      emissiveIntensity: 2.5,
      roughness: 0.3,
      metallic: 0
    })
  }
}

// --- Moving rings --------------------------------------------------------

/** Dashed lines separating the lanes. */
function buildStripes(): LoopRing {
  const entities: Entity[] = []
  const count = Math.floor(DECOR_RANGE_Z / STRIPE_SPACING)
  const dividerX = [TRACK.centerX - 2, TRACK.centerX + 2]

  for (const x of dividerX) {
    for (let i = 0; i < count; i++) {
      const stripe = engine.addEntity()
      GltfContainer.create(stripe, { src: STRIPE_MODEL })
      Transform.create(stripe, {
        position: Vector3.create(x, TRACK.roadY + 0.06, TRACK.despawnZ + i * STRIPE_SPACING),
        scale: Vector3.create(2, 1, 1.6)
      })
      entities.push(stripe)
    }
  }

  return { entities, length: count * STRIPE_SPACING }
}

/** Luminous pylons at the edge of the road. */
function buildPylons(): LoopRing {
  const entities: Entity[] = []
  const count = Math.floor(DECOR_RANGE_Z / PYLON_SPACING)

  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const pylon = engine.addEntity()
      GltfContainer.create(pylon, { src: PYLON_MODEL })
      Transform.create(pylon, {
        position: Vector3.create(
          TRACK.centerX + side * (TRACK.roadWidth / 2 + 0.9),
          TRACK.roadY + PYLON_BASE_Y,
          TRACK.despawnZ + i * PYLON_SPACING
        ),
        rotation: Quaternion.fromEulerDegrees(0, side > 0 ? 180 : 0, 0)
      })
      entities.push(pylon)
    }
  }

  return { entities, length: count * PYLON_SPACING }
}

/**
 * Two rows of buildings.
 *
 * Each entity's model is set on creation and never changes: swapping
 * `GltfContainer.src` on the fly triggers a reload and a frame stutter.
 * Variety comes from re-rolling scale, rotation, and X every time a piece
 * gets recycled.
 */
function buildBuildings(): LoopRing {
  const entities: Entity[] = []
  const count = Math.floor(TRACK.spawnZ / BUILDING_SPACING)

  for (let s = 0; s < TRACK.buildingX.length; s++) {
    for (let i = 0; i < count; i++) {
      const building = engine.addEntity()
      GltfContainer.create(building, { src: BUILDING_MODELS[(i + s) % BUILDING_MODELS.length] })
      Transform.create(building, {
        position: Vector3.create(TRACK.buildingX[s], 0, TRACK.despawnZ + i * BUILDING_SPACING)
      })
      randomizeBuilding(building, s)
      entities.push(building)
    }
  }

  const perSide = count
  return {
    entities,
    length: count * BUILDING_SPACING,
    onWrap: (entity, index) => randomizeBuilding(entity, Math.floor(index / perSide))
  }
}

function randomizeBuilding(entity: Entity, sideIndex: number) {
  const side = sideIndex === 0 ? -1 : 1
  const transform = Transform.getMutable(entity)
  transform.position.x = TRACK.buildingX[sideIndex] + side * Math.random() * 10
  transform.scale = Vector3.create(1 + Math.random() * 0.8, 1 + Math.random() * 2.4, 1 + Math.random() * 0.8)
  transform.rotation = Quaternion.fromEulerDegrees(0, side > 0 ? 180 : 0, 0)
}
