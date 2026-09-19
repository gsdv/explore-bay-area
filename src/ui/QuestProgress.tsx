import { useStore } from '../store'

/** Top-right: a thin line with one dot per stop, coloured up to the current stop. */
export function QuestProgress() {
  const quest = useStore((s) => s.activeQuest)
  const step = useStore((s) => s.questStep)
  const goToStop = useStore((s) => s.goToStop)
  if (!quest) return null
  const n = quest.stops.length
  const cur = step ?? -1
  const W = 260, PAD = 10
  const x = (i: number) => PAD + ((W - 2 * PAD) * i) / (n - 1)
  return (
    <div className="quest-progress" style={{ ['--quest' as any]: quest.color }} key={quest.id}>
      <svg viewBox={`0 0 ${W} 24`} width={W} height={24}>
        <line x1={x(0)} y1={12} x2={x(n - 1)} y2={12} className="quest-progress__rail" />
        {cur > 0 && <line x1={x(0)} y1={12} x2={x(cur)} y2={12} className="quest-progress__done" />}
        {quest.stops.map((s, i) => (
          <g key={s.id} className={'quest-progress__stop' + (i === cur ? ' is-current' : i < cur ? ' is-passed' : '')} onClick={() => goToStop(i)}>
            <circle cx={x(i)} cy={12} r={9} className="quest-progress__hit">
              <title>{s.name}</title>
            </circle>
            <circle cx={x(i)} cy={12} r={i === cur ? 5.5 : 4} className="quest-progress__dot" />
          </g>
        ))}
      </svg>
      <div className="quest-progress__label">{step === null ? 'Not started' : `${step + 1} / ${n} · ${quest.stops[step].name}`}</div>
    </div>
  )
}
