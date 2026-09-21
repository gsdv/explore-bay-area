export type LandmarkKind =
  | 'bridge' | 'tower' | 'pyramid' | 'ferry' | 'coit' | 'sutro' | 'rotunda' | 'stadium' | 'arena'
  | 'peak' | 'park' | 'beach' | 'houses' | 'island' | 'campanile' | 'museum' | 'wharf' | 'street' | 'gate' | 'forest' | 'town' | 'campus'

export interface Landmark {
  id: string
  name: string
  kind: LandmarkKind
  lat: number
  lng: number
  /** for bridges: the other end */
  lat2?: number
  lng2?: number
  area: string
  blurb: string
  tip?: string
  /** metres, for towers */
  height?: number
  /** compass bearing in degrees of the model's local north (−Z); downtown SF's street grid is −9 */
  bearing?: number
  tags?: ('nature' | 'icon' | 'culture' | 'view' | 'food' | 'hike')[]
}

export const landmarks: Landmark[] = [
  { id: 'ggb', name: 'Golden Gate Bridge', kind: 'bridge', lat: 37.8104, lng: -122.4772, lat2: 37.8322, lng2: -122.4796, area: 'Presidio', blurb: 'Opened in 1937, the 1.7-mile suspension bridge in "International Orange" is the symbol of the city. Walk or bike across for free.', tip: 'Go early on a weekday; fog usually burns off by noon in summer, but bring a jacket regardless.', tags: ['icon', 'view'] },
  { id: 'baybridge', name: 'Bay Bridge', kind: 'bridge', lat: 37.7866, lng: -122.3890, lat2: 37.8203, lng2: -122.3210, area: 'Embarcadero', blurb: 'Two bridges in one: a double suspension span to Yerba Buena Island, then the newer self-anchored span to Oakland. The west span glows with the Bay Lights at night.', tags: ['icon'] },
  { id: 'coit', name: 'Coit Tower', kind: 'coit', lat: 37.8024, lng: -122.4058, area: 'Telegraph Hill', blurb: 'A 210-foot art-deco tower from 1933 with WPA murals inside and a 360° view from the top.', tip: 'Take the Filbert Steps up from the Embarcadero; the gardens are the best part.', height: 64, tags: ['icon', 'view'] },
  { id: 'transamerica', name: 'Transamerica Pyramid', kind: 'pyramid', lat: 37.79516, lng: -122.40279, bearing: -9, area: 'Financial District', blurb: 'The 853-foot pyramid defined the skyline from 1972 until Salesforce Tower topped it. A redwood grove hides at its base.', height: 260, tags: ['icon'] },
  { id: 'salesforcetower', name: 'Salesforce Tower', kind: 'tower', lat: 37.78978, lng: -122.39693, bearing: 45, area: 'SoMa', blurb: 'At 1,070 feet, the tallest building in San Francisco. The crown becomes a video artwork every night after dusk.', height: 326, tags: ['icon'] },
  { id: 'ferrybuilding', name: 'Ferry Building', kind: 'ferry', lat: 37.79554, lng: -122.39343, bearing: 53.6, area: 'Embarcadero', blurb: 'The 1898 terminal is now a food hall. Ferries still leave from behind it, and the Saturday farmers market is the best in the city.', tip: 'Saturday morning: farmers market outside, Blue Bottle and Hog Island oysters inside.', tags: ['food', 'icon'] },
  { id: 'sutro', name: 'Sutro Tower', kind: 'sutro', lat: 37.7552, lng: -122.4528, area: 'Twin Peaks', blurb: 'The 977-foot three-pronged antenna that locals use as a compass. It is visible from almost everywhere in the city.', height: 298, tags: ['icon'] },
  { id: 'alcatraz', name: 'Alcatraz', kind: 'island', lat: 37.8267, lng: -122.4230, area: 'The Bay', blurb: 'The former federal prison on a rock in the bay. The audio tour is narrated by former inmates and guards.', tip: 'Tickets sell out weeks ahead. Book the night tour if you can.', tags: ['icon', 'culture'] },
  { id: 'palace', name: 'Palace of Fine Arts', kind: 'rotunda', lat: 37.80289, lng: -122.44869, bearing: -100, area: 'Marina', blurb: 'A Roman-style rotunda built for the 1915 Panama-Pacific Exposition, kept because the city loved it too much to tear down.', tags: ['icon', 'culture'] },
  { id: 'oraclepark', name: 'Oracle Park', kind: 'stadium', lat: 37.7786, lng: -122.3893, area: 'Mission Bay', blurb: 'Home of the Giants. Home runs over right field splash into McCovey Cove, where kayakers wait.', tags: ['culture'] },
  { id: 'chasecenter', name: 'Chase Center', kind: 'arena', lat: 37.7680, lng: -122.3877, area: 'Mission Bay', blurb: 'Home of the Golden State Warriors since 2019.', tags: ['culture'] },
  { id: 'paintedladies', name: 'Painted Ladies', kind: 'houses', lat: 37.7763, lng: -122.4328, area: 'Alamo Square', blurb: 'The row of Victorian houses on Steiner Street, with downtown rising behind them. The classic postcard, and the Full House intro.', tags: ['icon'] },
  { id: 'twinpeaks', name: 'Twin Peaks', kind: 'peak', lat: 37.7544, lng: -122.4477, area: 'Twin Peaks', blurb: 'Two 922-foot hills near the geographic centre of the city, with the best free panorama in San Francisco.', tip: 'Sunset is the move; wind is guaranteed.', tags: ['view', 'nature'] },
  { id: 'lombard', name: 'Lombard Street', kind: 'street', lat: 37.8021, lng: -122.4187, area: 'Russian Hill', blurb: 'The "crookedest street", eight hairpin turns on a 27% grade, planted with hydrangeas.', tags: ['icon'] },
  { id: 'ggpark', name: 'Golden Gate Park', kind: 'park', lat: 37.7694, lng: -122.4862, area: 'Richmond / Sunset', blurb: '1,017 acres, bigger than Central Park: the de Young, the Academy of Sciences, a Japanese tea garden, bison, and windmills at the ocean end.', tip: 'JFK Drive is car-free. Rent a bike at Stanyan and ride to the beach.', tags: ['nature', 'culture'] },
  { id: 'presidio', name: 'The Presidio', kind: 'park', lat: 37.7989, lng: -122.4662, area: 'Presidio', blurb: 'A former army post turned national park: eucalyptus forest, coastal bluffs, the Tunnel Tops, and the Walt Disney museum.', tags: ['nature', 'hike'] },
  { id: 'landsend', name: 'Lands End', kind: 'beach', lat: 37.7876, lng: -122.5055, area: 'Outer Richmond', blurb: 'Wild cliffs at the mouth of the Golden Gate. The Coastal Trail passes the Sutro Baths ruins and a hidden labyrinth.', tags: ['nature', 'hike', 'view'] },
  { id: 'oceanbeach', name: 'Ocean Beach', kind: 'beach', lat: 37.7594, lng: -122.5107, area: 'Outer Sunset', blurb: 'Three and a half miles of cold Pacific sand. Bonfires in the fire pits, surfers at Sloat, and fog most of the summer.', tags: ['nature'] },
  { id: 'dolores', name: 'Dolores Park', kind: 'park', lat: 37.7596, lng: -122.4269, area: 'Mission', blurb: 'The city\'s living room on a sunny day, with a downtown view from the top corner. Get a burrito on Mission Street first.', tags: ['nature', 'food'] },
  { id: 'bernal', name: 'Bernal Heights', kind: 'peak', lat: 37.7432, lng: -122.4142, area: 'Bernal Heights', blurb: 'A grassy hilltop loop with dogs, hawks and a full sweep of the city.', tags: ['view', 'nature'] },
  { id: 'pier39', name: 'Fisherman\'s Wharf & Pier 39', kind: 'wharf', lat: 37.81001, lng: -122.41039, bearing: -16, area: 'North Beach', blurb: 'Sea lions, sourdough bowls and the Musée Mécanique. Touristy, but the sea lions are worth it.', tags: ['culture', 'food'] },
  { id: 'chinatown', name: 'Chinatown Dragon Gate', kind: 'gate', lat: 37.7906, lng: -122.4056, area: 'Chinatown', blurb: 'The gate on Grant Avenue marks the oldest Chinatown in North America. Go for dim sum and the fortune cookie factory on Ross Alley.', tags: ['culture', 'food'] },
  { id: 'exploratorium', name: 'Exploratorium', kind: 'museum', lat: 37.8010, lng: -122.3982, area: 'Embarcadero', blurb: 'A hands-on science museum on Pier 15. Thursday nights are adults-only.', tags: ['culture'] },
  { id: 'legion', name: 'Legion of Honor', kind: 'museum', lat: 37.7845, lng: -122.5008, area: 'Lincoln Park', blurb: 'A fine-arts museum in a Beaux-Arts palace above the Golden Gate, with a Rodin collection and the Vertigo staircase.', tags: ['culture', 'view'] },
  { id: 'crissy', name: 'Crissy Field', kind: 'beach', lat: 37.8039, lng: -122.4640, area: 'Presidio', blurb: 'A restored shoreline with the best straight-on view of the Golden Gate Bridge. Warming Hut for coffee at the far end.', tags: ['nature', 'view'] },
  { id: 'mttam', name: 'Mount Tamalpais', kind: 'peak', lat: 37.9235, lng: -122.5965, area: 'Marin', blurb: 'The 2,571-foot "Sleeping Lady" of Marin. From East Peak you can see the Farallones, the Sierra, and the whole bay.', tags: ['hike', 'nature', 'view'] },
  { id: 'muirwoods', name: 'Muir Woods', kind: 'forest', lat: 37.8912, lng: -122.5719, area: 'Marin', blurb: 'Old-growth coast redwoods in a quiet canyon on the flank of Mt Tam. Parking requires a reservation.', tags: ['nature', 'hike'] },
  { id: 'sausalito', name: 'Sausalito', kind: 'town', lat: 37.8591, lng: -122.4853, area: 'Marin', blurb: 'A waterfront town of houseboats and hillside houses. Bike across the bridge and take the ferry back.', tags: ['view', 'food'] },
  { id: 'angelisland', name: 'Angel Island', kind: 'island', lat: 37.8609, lng: -122.4326, area: 'The Bay', blurb: 'The largest island in the bay, an immigration station turned state park with a 5-mile perimeter loop.', tags: ['hike', 'nature'] },
  { id: 'campanile', name: 'Sather Tower (Campanile)', kind: 'campanile', lat: 37.8721, lng: -122.2578, area: 'Berkeley', blurb: 'The 307-foot bell tower at UC Berkeley. Ride the elevator up for a view across the bay to the Golden Gate.', height: 94, tags: ['view', 'culture'] },
  { id: 'stanford', name: 'Stanford (Hoover Tower)', kind: 'campus', lat: 37.4275, lng: -122.1697, area: 'Palo Alto', blurb: 'The 8,000-acre farm that seeded Silicon Valley. Hoover Tower and the Main Quad are the postcards; the Dish trail is the hike.', height: 87, tags: ['culture', 'hike'] },
  { id: 'levis', name: 'Levi\'s Stadium', kind: 'stadium', lat: 37.4033, lng: -121.9694, area: 'Santa Clara', blurb: 'Home of the 49ers, next to the NVIDIA and Intel campuses.', tags: ['culture'] },
  { id: 'mavericks', name: 'Mavericks (Half Moon Bay)', kind: 'beach', lat: 37.4956, lng: -122.4979, area: 'Coastside', blurb: 'One of the biggest surf breaks in the world, firing on winter swells. Pillar Point harbour has the fish tacos.', tags: ['nature'] },
  { id: 'mtdiablo', name: 'Mount Diablo', kind: 'peak', lat: 37.8816, lng: -121.9147, area: 'East Bay', blurb: 'At 3,849 feet, the East Bay\'s summit. On a clear winter day the view stretches from Lassen to Half Dome.', tags: ['hike', 'view'] },
  { id: 'missionmurals', name: 'Mission Murals (Clarion Alley)', kind: 'street', lat: 37.7628, lng: -122.4200, area: 'Mission', blurb: 'Hundreds of murals across the Mission; Clarion Alley and Balmy Alley are the dense ones.', tags: ['culture'] },
]
