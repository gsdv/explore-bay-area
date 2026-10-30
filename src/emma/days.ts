/**
 * Emma's itinerary: one entry per day, each an ordered list of stops with a time range, a description and a camera view.
 * Everything here is a placeholder to be swapped for the real plans (dates, restaurants, reservations).
 *
 * Editing notes:
 * - `date` is ISO (YYYY-MM-DD); the weekday and "Nov 6" label are derived from it.
 * - `start` / `end` are 24-hour "HH:MM" strings; the UI shows them as "9:00 – 10:30 am" and the length.
 * - `view` is the camera for that stop: distance in world units (1 = 100 m) and heading in radians
 *   (0 looks north, π/2 looks west, −π/2 looks east, π looks south).
 * - `landmark` names a landmark id from src/data/landmarks.ts that the stop is about, if any.
 */

export type StopKind = 'food' | 'sight' | 'walk' | 'view' | 'night'

export interface Stop {
  id: string
  start: string
  end: string
  kind: StopKind
  /** the stop's full title, as the schedule and the card show it */
  title: string
  /** the location in a word or two ("Coit Tower"), for the Next button */
  name: string
  /** the place, as a line under the title */
  place: string
  lat: number
  lng: number
  /** what to do there, a few sentences */
  about: string
  /** how to get here from the previous stop */
  getThere?: string
  tips?: string[]
  landmark?: string
  view?: { dist?: number; yaw?: number }
}

export interface Day {
  id: string
  date: string
  title: string
  intro: string
  color: string
  stops: Stop[]
}

export const days: Day[] = [
  {
    id: 'day1',
    date: '2026-11-06',
    title: 'The Postcard Day',
    intro: 'The San Francisco everyone pictures: the waterfront, the sea lions, the crooked street, and a walk out over the Golden Gate in the late-afternoon light.',
    color: '#f04a00',
    stops: [
      {
        id: 'ferry',
        name: 'Ferry Building',
        start: '09:00', end: '10:00',
        kind: 'food',
        title: 'Breakfast at the Ferry Building',
        place: 'Ferry Building, Embarcadero',
        lat: 37.79554, lng: -122.39343,
        landmark: 'ferrybuilding',
        // from the bay, looking back at the city: from the other side the towers block it
        view: { dist: 10, yaw: 1.35 },
        about: 'Start under the clock tower. The 1898 terminal is now a food hall: coffee, pastries and oysters inside, and the bay right behind it. Take your coffee out to the back and watch the ferries come and go.',
        tips: ['Placeholder: swap in the breakfast spot.', 'On Saturdays there is a farmers market out front.'],
      },
      {
        id: 'pier39',
        name: 'Embarcadero',
        start: '10:15', end: '11:45',
        kind: 'walk',
        title: 'Along the Embarcadero to the sea lions',
        place: "Pier 39, Fisherman's Wharf",
        lat: 37.81001, lng: -122.41039,
        landmark: 'pier39',
        view: { dist: 10, yaw: 0.25 },
        getThere: 'A flat 25-minute walk north along the water, or the F-line streetcar.',
        about: 'Follow the piers north to Pier 39, where hundreds of sea lions have been hauling out on the floating docks since 1989. Touristy, yes, but the sea lions are worth it, and Alcatraz sits right across the water.',
      },
      {
        id: 'wharf-lunch',
        name: "Fisherman's Wharf",
        start: '12:00', end: '13:00',
        kind: 'food',
        title: 'Lunch at the Wharf',
        place: "Fisherman's Wharf",
        lat: 37.8080, lng: -122.4177,
        view: { dist: 9, yaw: 0 },
        getThere: 'Five minutes west along Jefferson Street.',
        about: 'Placeholder for a lunch spot. The classic is clam chowder in a sourdough bread bowl, eaten standing up by the crab stands.',
      },
      {
        id: 'lombard',
        name: 'Lombard Street',
        start: '13:15', end: '13:45',
        kind: 'sight',
        title: 'Down Lombard Street',
        place: 'Lombard Street, Russian Hill',
        lat: 37.80211, lng: -122.41881,
        landmark: 'lombard',
        view: { dist: 7, yaw: 1.4 },
        getThere: 'Uphill on Hyde Street, or ride the Powell–Hyde cable car to the top.',
        about: 'Eight hairpin turns on a 27% grade, lined with hydrangeas. Walk down the steps on either side rather than queueing in a car, and look back up from the bottom for the photo.',
      },
      {
        id: 'coit',
        name: 'Coit Tower',
        start: '14:00', end: '15:15',
        kind: 'view',
        title: 'Coit Tower and the Filbert Steps',
        place: 'Telegraph Hill',
        lat: 37.8024, lng: -122.4058,
        landmark: 'coit',
        view: { dist: 9, yaw: -0.7 },
        getThere: 'Fifteen minutes east through North Beach.',
        about: 'The 1933 art-deco tower on top of Telegraph Hill, with murals inside and a 360° view from the top. Walk down the Filbert Steps on the east side: wooden stairs through gardens, with wild parrots if you are lucky.',
      },
      {
        id: 'ggb',
        name: 'Golden Gate Bridge',
        start: '15:30', end: '17:00',
        kind: 'walk',
        title: 'Walk out on the Golden Gate Bridge',
        place: 'Golden Gate Bridge Welcome Center',
        lat: 37.8078, lng: -122.4752,
        landmark: 'ggb',
        view: { dist: 22, yaw: 0.15 },
        getThere: 'A 20-minute ride west across the city.',
        about: 'Walk the east sidewalk out to the first tower and back (about an hour), or all the way across to the vista point in Marin. The late-afternoon light turns the International Orange deep red.',
        tips: ['It is always windier and colder on the bridge than it looks. Bring a jacket.'],
      },
      {
        id: 'northbeach',
        name: 'North Beach',
        start: '19:00', end: '21:00',
        kind: 'food',
        title: 'Dinner in North Beach',
        place: 'Washington Square, North Beach',
        lat: 37.7997, lng: -122.4075,
        view: { dist: 9, yaw: 2.8 },
        getThere: 'Back across town, about 20 minutes by car.',
        about: 'Placeholder for the dinner reservation. North Beach is the old Italian quarter: red-sauce restaurants, espresso bars and the Beat-era bookshop City Lights.',
      },
    ],
  },
  {
    id: 'day2',
    date: '2026-11-07',
    title: 'Murals, Parks and the Ocean',
    intro: 'A slower day across the middle of the city: the Mission for coffee, murals and burritos, Golden Gate Park in the afternoon, sunset on the cliffs at Lands End, then a night out.',
    color: '#2f6f9f',
    stops: [
      {
        id: 'mission-coffee',
        name: 'Valencia Street',
        start: '09:00', end: '10:00',
        kind: 'food',
        title: 'Coffee and pastries in the Mission',
        place: 'Valencia Street, Mission',
        lat: 37.7615, lng: -122.4215,
        view: { dist: 8, yaw: 0.3 },
        about: 'Placeholder for a café. Valencia Street is lined with them, along with bookshops and vintage stores worth a wander.',
      },
      {
        id: 'murals',
        name: 'Clarion Alley',
        start: '10:00', end: '11:30',
        kind: 'walk',
        title: 'The Mission murals',
        place: 'Clarion Alley and Balmy Alley',
        lat: 37.7628, lng: -122.4200,
        landmark: 'missionmurals',
        view: { dist: 8, yaw: 0.2 },
        getThere: 'Around the corner.',
        about: 'Hundreds of murals cover the Mission. Clarion Alley, between Mission and Valencia, changes every year; Balmy Alley, further south, has murals going back to the 1980s.',
      },
      {
        id: 'dolores',
        name: 'Dolores Park',
        start: '12:00', end: '13:30',
        kind: 'food',
        title: 'Burritos in Dolores Park',
        place: 'Mission Dolores Park',
        lat: 37.7596, lng: -122.4269,
        landmark: 'dolores',
        view: { dist: 9, yaw: -0.9 },
        getThere: 'Pick up burritos on the way (placeholder taquería), then walk up 18th Street.',
        about: 'The city’s living room on a sunny day. Take the burritos up to the top corner by Church and 20th for the view of downtown over the palm trees.',
      },
      {
        id: 'ggpark',
        name: 'Golden Gate Park',
        start: '13:45', end: '15:45',
        kind: 'sight',
        title: 'Golden Gate Park',
        place: 'Music Concourse: de Young and the Academy of Sciences',
        lat: 37.7701, lng: -122.4703,
        landmark: 'ggpark',
        view: { dist: 18, yaw: 0.2 },
        getThere: 'About 20 minutes west by car or the N Judah.',
        about: 'A thousand acres, bigger than Central Park. Pick one or two: the Japanese Tea Garden, the de Young tower’s free viewing floor, the Academy of Sciences, or a walk to the bison paddock.',
      },
      {
        id: 'landsend',
        name: 'Lands End',
        start: '16:00', end: '17:15',
        kind: 'view',
        title: 'Sunset at Lands End',
        place: 'Lands End and the Sutro Baths',
        lat: 37.7876, lng: -122.5055,
        landmark: 'landsend',
        view: { dist: 14, yaw: 0.9 },
        getThere: 'Ten minutes north-west to the Lands End Lookout.',
        about: 'Cliffs at the mouth of the Golden Gate. Walk down to the ruins of the Sutro Baths, then along the Coastal Trail toward the bridge as the sun drops into the Pacific.',
        tips: ['Sunset is around 5 pm in early November. It gets cold fast once the sun is down.'],
      },
      {
        id: 'nightout',
        name: 'The Castro',
        start: '20:00', end: '23:00',
        kind: 'night',
        title: 'A night out',
        place: 'The Castro',
        lat: 37.7609, lng: -122.4350,
        view: { dist: 9, yaw: 0.3 },
        getThere: 'About 20 minutes back across the city.',
        about: 'Placeholder: a bar, a show, or just walking the neighborhood.',
      },
    ],
  },
  {
    id: 'day3',
    date: '2026-11-08',
    title: 'North of the Bridge',
    intro: 'Over the Golden Gate into Marin: redwoods at Muir Woods, the summit of Mount Tamalpais, a late lunch in Sausalito, then back to the city for sunset on Twin Peaks and a farewell dinner.',
    color: '#3f7a4a',
    stops: [
      {
        id: 'marina',
        name: 'The Marina',
        start: '08:30', end: '09:15',
        kind: 'food',
        title: 'Breakfast in the Marina',
        place: 'Chestnut Street, Marina',
        lat: 37.8004, lng: -122.4366,
        view: { dist: 9, yaw: 0.2 },
        about: 'Placeholder for a breakfast spot on the way north. Grab something to take along: there is not much food at Muir Woods.',
      },
      {
        id: 'muirwoods',
        name: 'Muir Woods',
        start: '10:00', end: '12:00',
        kind: 'walk',
        title: 'Muir Woods',
        place: 'Muir Woods National Monument',
        lat: 37.8920, lng: -122.5718,
        landmark: 'muirwoods',
        view: { dist: 22, yaw: 0.2 },
        getThere: 'Across the bridge and up the winding road, about 40 minutes.',
        about: 'Old-growth coast redwoods, some over 1,000 years old, in a quiet canyon on the flank of Mount Tam. The main loop along Redwood Creek is flat and takes about an hour; Cathedral Grove is the hushed middle.',
        tips: ['Parking or shuttle reservations are required. Book them ahead.'],
      },
      {
        id: 'tam',
        name: 'Mount Tamalpais',
        start: '12:30', end: '13:45',
        kind: 'view',
        title: 'The top of Mount Tamalpais',
        place: 'East Peak, Mount Tamalpais',
        lat: 37.92909, lng: -122.57779,
        landmark: 'mttam',
        view: { dist: 26, yaw: 0.6 },
        getThere: 'Up Panoramic Highway and Ridgecrest Boulevard, about 30 minutes.',
        about: 'A short, steep trail from the East Peak parking lot to the fire lookout at 2,571 feet. On a clear day you can see the whole bay, the city, the Farallon Islands and, far off, the Sierra.',
      },
      {
        id: 'sausalito',
        name: 'Sausalito',
        start: '14:15', end: '15:45',
        kind: 'food',
        title: 'Late lunch in Sausalito',
        place: 'Bridgeway, Sausalito',
        lat: 37.8591, lng: -122.4853,
        landmark: 'sausalito',
        view: { dist: 14, yaw: 0.4 },
        getThere: 'Down the mountain, about 35 minutes.',
        about: 'Placeholder for a lunch spot on the water. Afterwards walk Bridgeway along the bay, with the city skyline across the water, and look at the houseboats further north.',
      },
      {
        id: 'twinpeaks',
        name: 'Twin Peaks',
        start: '16:15', end: '17:15',
        kind: 'view',
        title: 'Sunset on Twin Peaks',
        place: 'Twin Peaks',
        lat: 37.75191, lng: -122.44815,
        landmark: 'twinpeaks',
        view: { dist: 16, yaw: -0.6 },
        getThere: 'Back over the bridge and up to the middle of the city, about 30 minutes.',
        about: 'Two hills near the centre of the city with the best free panorama of San Francisco: downtown, both bridges and the bay laid out below as the lights come on.',
        tips: ['Wind is guaranteed. Bring the jacket again.'],
      },
      {
        id: 'farewell',
        name: 'Hayes Valley',
        start: '19:00', end: '21:00',
        kind: 'food',
        title: 'Farewell dinner',
        place: 'Hayes Valley',
        lat: 37.7765, lng: -122.4241,
        view: { dist: 9, yaw: 0.3 },
        getThere: 'Fifteen minutes downhill.',
        about: 'Placeholder for the last-night reservation. Hayes Valley is small and walkable, with good restaurants and a few bars for a nightcap.',
      },
    ],
  },
]

/** "Friday", "Nov 6" for a day's ISO date (read at noon so no timezone tips it into the day before) */
export function dayLabel(day: Day): { weekday: string; date: string } {
  const d = new Date(`${day.date}T12:00:00`)
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const clock = (hhmm: string) => {
  const t = minutes(hhmm), h = Math.floor(t / 60) % 24
  return { text: `${((h + 11) % 12) + 1}:${String(t % 60).padStart(2, '0')}`, pm: h >= 12 }
}

/** "9:00 am", "1:30 pm" */
export function clockLabel(hhmm: string): string {
  const c = clock(hhmm)
  return `${c.text} ${c.pm ? 'pm' : 'am'}`
}

/** "9:00 – 10:30 am", "11:30 am – 1:00 pm" */
export function timeRange(start: string, end: string): string {
  const a = clock(start), b = clock(end)
  const ap = (pm: boolean) => (pm ? 'pm' : 'am')
  return a.pm === b.pm ? `${a.text} – ${b.text} ${ap(b.pm)}` : `${a.text} ${ap(a.pm)} – ${b.text} ${ap(b.pm)}`
}

/** "45 min", "1 h", "1 h 30 min" */
export function duration(start: string, end: string): string {
  const t = minutes(end) - minutes(start)
  const h = Math.floor(t / 60), m = t % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

export const KIND_LABEL: Record<StopKind, string> = { food: 'Eat', sight: 'See', walk: 'Walk', view: 'View', night: 'Night' }
