// Draws the family's map as SVG path strings on the server, so the browser
// never downloads atlas data and no outside map service learns which cities a
// family lives in.

import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo'
import { geoBounds, geoGraticule, geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo'
import type { Feature, Geometry, LineString, MultiLineString, Polygon } from 'geojson'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110m from 'world-atlas/countries-110m.json'
import countries50m from 'world-atlas/countries-50m.json'

import type { RoomMap } from '../../shared/utils/room-types'

/** One city on the map, and how many of the family say they are there. */
export interface RoomPlace {
  id: string
  lat: number
  lng: number
  people: number
}

type Atlas = Topology<{ countries: GeometryCollection; land: GeometryCollection }>
type Bounds = [[number, number], [number, number]]

interface Piece<G extends Geometry> {
  geometry: G
  bounds: Bounds
}

interface Geography {
  land: Piece<Polygon>[]
  borders: Piece<LineString>[]
}

// Smallest frame, in degrees. Wide enough that a family in one inland city
// still sees a coast to place it by, not a blank patch of land.
const MIN_HALF_LAT = 11
const MIN_HALF_LNG = 20
// Beyond this spread a regional Mercator view distorts badly; show the globe.
const MAX_HALF_LAT = 30
const MAX_HALF_LNG = 60
const MARGIN = 1.35
// Frames wider than this many degrees gain nothing visible from 50m coastlines
// and would send several times the bytes.
const FINE_DETAIL_MAX_SPAN = 40
const GRATICULE_STEPS = [1, 2, 5, 10, 15, 30]

const geography = new Map<'50m' | '110m', Geography>()

/**
 * The atlas split into single polygons and lines, each with its bounds, so a
 * zoomed view projects only the pieces it can see. Built once per isolate.
 */
function loadGeography(detail: '50m' | '110m'): Geography {
  const cached = geography.get(detail)
  if (cached) return cached

  const atlas = (detail === '50m' ? countries50m : countries110m) as unknown as Atlas
  const land = feature(atlas, atlas.objects.land)
  const polygons = land.features.flatMap((f: Feature) =>
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((coordinates): Polygon => ({ type: 'Polygon', coordinates }))
      : f.geometry.type === 'Polygon'
        ? [f.geometry]
        : [],
  )
  const borderMesh: MultiLineString = mesh(atlas, atlas.objects.countries, (a, b) => a !== b)
  const lines = borderMesh.coordinates.map((coordinates): LineString => ({
    type: 'LineString',
    coordinates,
  }))

  const built: Geography = {
    land: polygons.map((geometry) => ({ geometry, bounds: geoBounds(geometry) })),
    borders: lines.map((geometry) => ({ geometry, bounds: geoBounds(geometry) })),
  }
  geography.set(detail, built)
  return built
}

/** Lat/lng box around every place, or null when only the globe fits them. */
export function roomMapFrame(places: Pick<RoomPlace, 'lat' | 'lng'>[]): Bounds | null {
  if (!places.length) return null
  const lats = places.map((place) => place.lat)
  const lngs = places.map((place) => place.lng)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)]

  const halfLat = Math.max(((north - south) / 2) * MARGIN, MIN_HALF_LAT)
  const halfLng = Math.max(((east - west) / 2) * MARGIN, MIN_HALF_LNG)
  if (halfLat > MAX_HALF_LAT || halfLng > MAX_HALF_LNG) return null

  const lat = Math.min(Math.max((north + south) / 2, -75 + halfLat), 80 - halfLat)
  const lng = (east + west) / 2
  return [
    [lng - halfLng, lat - halfLat],
    [lng + halfLng, lat + halfLat],
  ]
}

function graticuleStep(frame: Bounds): number {
  const span = Math.max(frame[1][0] - frame[0][0], frame[1][1] - frame[0][1])
  return GRATICULE_STEPS.find((step) => span / step <= 8) ?? 30
}

/** A piece is drawn when its bounds overlap the view. Antimeridian pieces always are. */
function visible(bounds: Bounds, view: Bounds): boolean {
  const [[west, south], [east, north]] = bounds
  if (west > east) return true
  return !(east < view[0][0] || west > view[1][0] || north < view[0][1] || south > view[1][1])
}

export function renderRoomMap(
  places: RoomPlace[],
  size: { width: number; height: number; padding?: number },
): RoomMap {
  const { width, height, padding = 24 } = size
  const inner: Bounds = [
    [padding, padding],
    [width - padding, height - padding],
  ]
  const frame = roomMapFrame(places)

  let projection: GeoProjection
  let pieces: Geography
  let step: number

  if (frame) {
    projection = geoMercator()
      .fitExtent(inner, { type: 'MultiPoint', coordinates: frame })
      .clipExtent([
        [0, 0],
        [width, height],
      ])
    const span = Math.max(frame[1][0] - frame[0][0], frame[1][1] - frame[0][1])
    const geo = loadGeography(span > FINE_DETAIL_MAX_SPAN ? '110m' : '50m')
    const topLeft = projection.invert?.([0, 0])
    const bottomRight = projection.invert?.([width, height])
    const view: Bounds =
      topLeft && bottomRight
        ? [
            [topLeft[0], bottomRight[1]],
            [bottomRight[0], topLeft[1]],
          ]
        : frame
    pieces = {
      land: geo.land.filter((piece) => visible(piece.bounds, view)),
      borders: geo.borders.filter((piece) => visible(piece.bounds, view)),
    }
    step = graticuleStep(frame)
  } else {
    projection = geoNaturalEarth1().fitExtent(inner, { type: 'Sphere' })
    pieces = loadGeography('110m')
    step = 30
  }

  const path = geoPath(projection).digits(1)
  const draw = (object: GeoPermissibleObjects) => path(object) ?? ''
  const collection = (items: Piece<Geometry>[]): GeoPermissibleObjects => ({
    type: 'GeometryCollection',
    geometries: items.map((piece) => piece.geometry),
  })

  return {
    width,
    height,
    world: !frame,
    outline: frame ? null : draw({ type: 'Sphere' }),
    land: draw(collection(pieces.land)),
    borders: draw(collection(pieces.borders)),
    graticule: draw(geoGraticule().step([step, step])()),
    points: places.flatMap((place) => {
      const point = projection([place.lng, place.lat])
      return point
        ? [
            {
              id: place.id,
              x: Math.round(point[0] * 10) / 10,
              y: Math.round(point[1] * 10) / 10,
              people: place.people,
            },
          ]
        : []
    }),
  }
}
