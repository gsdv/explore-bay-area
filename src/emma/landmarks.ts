/**
 * Landmarks only Emma's page has. They carry their own model (`parts`) instead of a model from scene/LandmarkModel.tsx, so
 * the main page and the data pipeline never see them; their `kind` only picks the scene's defaults (a building standing on
 * the ground, popping up on hover). Put any footprint they replace into account here too: the Monadnock stands on a lot
 * the baked downtown buildings leave empty, so it needs no clearing.
 */
import type { Landmark } from '../data/landmarks'
import type { Part } from '../scene/LandmarkModel'
import { monadnockParts } from './scene/monadnock'

export interface EmmaLandmark extends Landmark {
  parts: () => Part[]
}

export const emmaLandmarks: EmmaLandmark[] = [
  {
    id: 'monadnock',
    name: 'Notion HQ',
    kind: 'tower',
    lat: 37.787658,
    lng: -122.402755,
    bearing: -44.75,
    area: 'Monadnock Building',
    blurb:
      'Notion moved its headquarters here from the Mission in 2025, into five floors of the Monadnock Building. The ten-storey block of cream brick and terracotta was finished in 1907, as downtown rebuilt after the earthquake and fire.',
    tip: 'Come by after dark, when the arched doorway on Market lights up the lobby\'s painted vault. The Palace Hotel\'s glass-roofed Garden Court is next door.',
    tags: ['culture'],
    parts: monadnockParts,
  },
]
