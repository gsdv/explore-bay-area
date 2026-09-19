declare module 'mapshaper'
declare module 'osmtogeojson' {
  const f: (osm: any, opts?: any) => GeoJSON.FeatureCollection
  export default f
}
