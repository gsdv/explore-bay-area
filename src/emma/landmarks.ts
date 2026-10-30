/**
 * Landmarks only Emma's page has. They carry their own model (`parts`) instead of a model from scene/LandmarkModel.tsx, so
 * the main page and the data pipeline never see them; their `kind` only picks the scene's defaults (a building standing on
 * the ground, popping up on hover). A model standing where the baked buildings already have a footprint names a point
 * inside it in `covers`, and world.ts drops that footprint (the Monadnock's lot is empty in the bake, the Hallidie's isn't).
 */
import type { ComponentType } from 'react'
import type { Landmark } from '../data/landmarks'
import type { Part } from '../scene/LandmarkModel'
import { monadnockParts } from './scene/monadnock'
import { hallidieParts } from './scene/hallidie'
import { NotionLogo, CircleCILogo, LOGO_HEIGHT } from './scene/logos'

export interface EmmaLandmark extends Landmark {
  parts: () => Part[]
  /** something animated riding over the model, drawn inside its group from the model's top (`height` is how far it reaches
   *  above that: the label and the card's fly-to clear it) */
  topper?: { Node: ComponentType<{ top: number }>; height: number }
}

export const emmaLandmarks: EmmaLandmark[] = [
  {
    id: 'monadnock',
    name: 'Notion HQ',
    kind: 'tower',
    modelType: 'structure',
    lat: 37.787658,
    lng: -122.402755,
    bearing: -44.75,
    area: 'Monadnock Building',
    blurb:
      'Notion moved its headquarters here from the Mission in 2025, into five floors of the Monadnock Building. The ten-storey block of cream brick and terracotta was finished in 1907, as downtown rebuilt after the earthquake and fire.',
    tip: 'Come by after dark, when the arched doorway on Market lights up the lobby\'s painted vault. The Palace Hotel\'s glass-roofed Garden Court is next door.',
    tags: ['culture'],
    parts: monadnockParts,
    topper: { Node: NotionLogo, height: LOGO_HEIGHT },
  },
  {
    id: 'hallidie',
    name: 'CircleCI',
    kind: 'tower',
    modelType: 'structure',
    lat: 37.790213,
    lng: -122.403055,
    bearing: 170.7,
    covers: [[37.790213, -122.403055]],
    area: 'Hallidie Building',
    blurb:
      'CircleCI works on the seventh and top floor of the Hallidie Building, right under the gold cresting. Willis Polk finished it in 1918 with one of the country\'s first glass curtain walls. It is named for Andrew Hallidie, the cable car pioneer.',
    tip: 'Stand across Sutter Street to take in the whole front: the fire escapes bow out like balconies. The ground floor is the Center for Architecture + Design, with a gallery and a café.',
    tags: ['culture'],
    parts: hallidieParts,
    topper: { Node: CircleCILogo, height: LOGO_HEIGHT },
  },
]
