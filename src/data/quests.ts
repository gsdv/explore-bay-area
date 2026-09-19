export interface QuestStop {
  id: string
  name: string
  lat: number
  lng: number
  /** a landmark or company id to open when clicked */
  ref?: { kind: 'landmark' | 'company'; id: string }
  todo: string
}

export interface Quest {
  id: string
  title: string
  subtitle: string
  /** rough time on foot / transit */
  duration: string
  difficulty: 'easy' | 'moderate' | 'hard'
  color: string
  stops: QuestStop[]
}

export const quests: Quest[] = [
  {
    id: 'ai-route',
    title: 'The AI Route',
    subtitle: 'Walk past the offices where the frontier models are built. Most are within two miles of each other in SoMa and Mission Bay.',
    duration: '3 h on foot',
    difficulty: 'easy',
    color: '#5b4bd6',
    stops: [
      { id: 'anthropic', name: 'Anthropic', lat: 37.7877, lng: -122.3960, ref: { kind: 'company', id: 'anthropic' }, todo: 'Start at 500 Howard. Grab a coffee at the Salesforce Park rooftop next door.' },
      { id: 'databricks', name: 'Databricks', lat: 37.7917, lng: -122.3927, ref: { kind: 'company', id: 'databricks' }, todo: 'Walk to the Embarcadero waterfront; the Ferry Building is a block away.' },
      { id: 'perplexity', name: 'Perplexity', lat: 37.7917, lng: -122.4012, ref: { kind: 'company', id: 'perplexity' }, todo: 'Cut back through the Financial District.' },
      { id: 'scale', name: 'Scale AI', lat: 37.7709, lng: -122.4030, ref: { kind: 'company', id: 'scale' }, todo: 'Head south through SoMa along Townsend.' },
      { id: 'openai', name: 'OpenAI', lat: 37.7679, lng: -122.3900, ref: { kind: 'company', id: 'openai' }, todo: 'Finish in Mission Bay. Oracle Park and the Chase Center are right here for a game afterwards.' },
    ],
  },
  {
    id: 'nature-lover',
    title: 'Nature Lover',
    subtitle: 'Every big green space in the city, west to east. Ride Muni between them or make it a two-day bike loop.',
    duration: '2 days',
    difficulty: 'moderate',
    color: '#2f7d4a',
    stops: [
      { id: 'landsend', name: 'Lands End', lat: 37.7876, lng: -122.5055, ref: { kind: 'landmark', id: 'landsend' }, todo: 'Coastal Trail from the Sutro Baths to Eagle Point. Find the labyrinth.' },
      { id: 'oceanbeach', name: 'Ocean Beach', lat: 37.7594, lng: -122.5107, ref: { kind: 'landmark', id: 'oceanbeach' }, todo: 'Walk the sand south to the windmills.' },
      { id: 'ggpark', name: 'Golden Gate Park', lat: 37.7694, lng: -122.4862, ref: { kind: 'landmark', id: 'ggpark' }, todo: 'Bison paddock, Stow Lake, then the Conservatory of Flowers.' },
      { id: 'presidio', name: 'The Presidio', lat: 37.7989, lng: -122.4662, ref: { kind: 'landmark', id: 'presidio' }, todo: 'Tunnel Tops at sunset, then Crissy Field.' },
      { id: 'twinpeaks', name: 'Twin Peaks', lat: 37.7544, lng: -122.4477, ref: { kind: 'landmark', id: 'twinpeaks' }, todo: 'Climb both summits. Yes, both.' },
      { id: 'dolores', name: 'Dolores Park', lat: 37.7596, lng: -122.4269, ref: { kind: 'landmark', id: 'dolores' }, todo: 'Burrito from Mission Street, top corner of the park.' },
      { id: 'bernal', name: 'Bernal Heights', lat: 37.7432, lng: -122.4142, ref: { kind: 'landmark', id: 'bernal' }, todo: 'Finish with the loop trail and the swing, if it is back up.' },
    ],
  },
  {
    id: 'summit',
    title: 'To the Summit',
    subtitle: 'Mill Valley to the top of Mount Tamalpais on foot via the Old Railroad Grade, then down through Muir Woods.',
    duration: '6 h, 2,400 ft of climbing',
    difficulty: 'hard',
    color: '#b8542a',
    stops: [
      { id: 'millvalley', name: 'Mill Valley Depot', lat: 37.9060, lng: -122.5450, todo: 'Take the Golden Gate Transit bus to Mill Valley. Start at the Depot plaza.' },
      { id: 'mountainhome', name: 'Mountain Home Inn', lat: 37.9093, lng: -122.5768, todo: 'Up the Dipsea steps and Tenderfoot trail. Refill water here.' },
      { id: 'westpoint', name: 'West Point Inn', lat: 37.9130, lng: -122.6021, todo: 'Follow the Old Railroad Grade around the mountain. Lemonade on the porch.' },
      { id: 'eastpeak', name: 'East Peak', lat: 37.9282, lng: -122.5966, ref: { kind: 'landmark', id: 'mttam' }, todo: 'Plank Walk to the fire lookout. Whole bay below you.' },
      { id: 'muirwoods', name: 'Muir Woods', lat: 37.8912, lng: -122.5719, ref: { kind: 'landmark', id: 'muirwoods' }, todo: 'Descend the Bootjack and Ben Johnson trails into the redwoods. Shuttle back from the visitor centre.' },
    ],
  },
  {
    id: 'landmarks',
    title: 'Landmark Tour',
    subtitle: 'The postcard set in one long day, roughly north to south along the waterfront and over the hills.',
    duration: '1 day',
    difficulty: 'moderate',
    color: '#f04a00',
    stops: [
      { id: 'ggb', name: 'Golden Gate Bridge', lat: 37.8104, lng: -122.4772, ref: { kind: 'landmark', id: 'ggb' }, todo: 'Walk out to the south tower at least.' },
      { id: 'palace', name: 'Palace of Fine Arts', lat: 37.8029, lng: -122.4484, ref: { kind: 'landmark', id: 'palace' }, todo: 'Loop the lagoon.' },
      { id: 'lombard', name: 'Lombard Street', lat: 37.8021, lng: -122.4187, ref: { kind: 'landmark', id: 'lombard' }, todo: 'Walk down the crooked block, not up.' },
      { id: 'coit', name: 'Coit Tower', lat: 37.8024, lng: -122.4058, ref: { kind: 'landmark', id: 'coit' }, todo: 'Murals on the ground floor are free.' },
      { id: 'transamerica', name: 'Transamerica Pyramid', lat: 37.7952, lng: -122.4028, ref: { kind: 'landmark', id: 'transamerica' }, todo: 'Sit in the redwood grove at its base.' },
      { id: 'ferrybuilding', name: 'Ferry Building', lat: 37.7955, lng: -122.3937, ref: { kind: 'landmark', id: 'ferrybuilding' }, todo: 'Late lunch inside.' },
      { id: 'paintedladies', name: 'Painted Ladies', lat: 37.7763, lng: -122.4328, ref: { kind: 'landmark', id: 'paintedladies' }, todo: 'Take the 5 bus out Fulton to Alamo Square for golden hour.' },
    ],
  },
]
