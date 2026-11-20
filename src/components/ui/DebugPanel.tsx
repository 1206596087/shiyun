import { useState } from 'react'
import type { GalaxyConfig, QualityPreset } from '../../types/galaxy'
import { GALAXY_PRESETS } from '../../types/galaxy'

export function DebugPanel({ config, onChange }: { config: GalaxyConfig; onChange: (value: GalaxyConfig) => void }) {
  const [open, setOpen] = useState(false)
  const update = <K extends keyof GalaxyConfig>(key: K, value: GalaxyConfig[K]) => onChange({ ...config, [key]: value })
  const preset = (value: QualityPreset) => onChange({ ...GALAXY_PRESETS[value] })
  return (
    <section className={`debug-panel glass-panel ${open ? 'is-open' : ''}`}>
      <button className="panel-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>视觉参数</span><span>{open ? '收起 −' : '展开 +'}</span>
      </button>
      {open && (
        <div className="debug-panel__body">
          <div className="preset-row">
            {(['default', 'high', 'low'] as const).map((value) => (
              <button key={value} className={config.quality === value ? 'active' : ''} onClick={() => preset(value)}>
                {value === 'default' ? '默认' : value === 'high' ? '高画质' : '低性能'}
              </button>
            ))}
          </div>
          <Range label="星尘密度" value={config.density} min={0.35} max={1.5} step={0.05} onChange={(value) => update('density', value)} />
          <Range label="旋臂数量" value={config.armCount} min={3} max={5} step={1} onChange={(value) => update('armCount', value)} />
          <Range label="旋臂紧密度" value={config.tightness} min={0.65} max={1.8} step={0.05} onChange={(value) => update('tightness', value)} />
          <Range label="旋转速度" value={config.rotationSpeed} min={0} max={0.06} step={0.002} onChange={(value) => update('rotationSpeed', value)} />
          <Range label="星尘亮度" value={config.dustBrightness} min={0.2} max={1.3} step={0.05} onChange={(value) => update('dustBrightness', value)} />
          <Range label="星核亮度" value={config.coreBrightness} min={0.2} max={1.4} step={0.05} onChange={(value) => update('coreBrightness', value)} />
          <Range label="Bloom 强度" value={config.bloomIntensity} min={0} max={1.4} step={0.05} onChange={(value) => update('bloomIntensity', value)} />
          <label className="switch-row">
            <span>背景恒星</span>
            <input type="checkbox" checked={config.showBackgroundStars} onChange={(event) => update('showBackgroundStars', event.target.checked)} />
          </label>
        </div>
      )}
    </section>
  )
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="range-row">
      <span><b>{label}</b><output>{Number.isInteger(step) ? value : value.toFixed(step < 0.01 ? 3 : 2)}</output></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}
