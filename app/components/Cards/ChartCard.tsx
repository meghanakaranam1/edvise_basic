'use client'
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell,
} from 'recharts'

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
}

export interface ScatterPoint { x: number; y: number; label?: string }

export interface ChartData {
  chartType: 'bar' | 'grouped_bar' | 'horizontal_bar' | 'stacked_bar' | 'line' | 'radar' | 'scatter' | 'heatmap'
  title: string
  xAxis?: string
  yAxis?: string
  labels?: string[]
  datasets?: ChartDataset[]
  scatterData?: Array<{ series: string; points: ScatterPoint[]; color?: string }>
  // heatmap-specific
  xLabels?: string[]
  yLabels?: string[]
  values?: number[][]
  unit?: string
}

const PALETTE = ['#3E94A5', '#2A3B7C', '#c53030', '#B45309', '#15803d', '#7c3aed', '#0f766e']

function color(dataset: ChartDataset, i: number) {
  return dataset.color ?? PALETTE[i % PALETTE.length]
}

function buildGroupedData(labels: string[], datasets: ChartDataset[]) {
  return labels.map((label, i) => {
    const row: Record<string, string | number> = { label }
    datasets.forEach(d => { row[d.label] = d.data[i] ?? 0 })
    return row
  })
}

function HeatmapGrid({ xLabels, yLabels, values, unit }: { xLabels: string[]; yLabels: string[]; values: number[][]; unit?: string }) {
  const allVals = values.flat()
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  function cellColor(v: number) {
    const t = max === min ? 0.5 : (v - min) / (max - min)
    // white → deep red
    const r = Math.round(255 - t * (255 - 180))
    const g = Math.round(255 - t * (255 - 30))
    const b = Math.round(255 - t * (255 - 30))
    return `rgb(${r},${g},${b})`
  }
  const cellW = Math.max(60, Math.floor(480 / xLabels.length))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ width: 100, padding: '4px 8px' }} />
            {xLabels.map(xl => (
              <th key={xl} style={{ width: cellW, padding: '4px 8px', color: '#2A3B7C', fontWeight: 600, textAlign: 'center' }}>{xl}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yLabels.map((yl, yi) => (
            <tr key={yl}>
              <td style={{ padding: '4px 8px', color: '#2A3B7C', fontWeight: 500, whiteSpace: 'nowrap' }}>{yl}</td>
              {xLabels.map((_, xi) => {
                const v = values[yi]?.[xi] ?? 0
                const bg = cellColor(v)
                const textColor = (v - min) / (max - min) > 0.55 ? '#fff' : '#1a1a2e'
                return (
                  <td key={xi} style={{ background: bg, textAlign: 'center', padding: '10px 8px', color: textColor, fontWeight: 600, borderRadius: 4, border: '2px solid #fff' }}>
                    {v.toFixed(1)}{unit ?? ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 10, color: '#7a89b8' }}>
        <span>Low</span>
        <div style={{ width: 80, height: 8, borderRadius: 4, background: 'linear-gradient(to right, rgb(255,255,255), rgb(180,30,30))' }} />
        <span>High</span>
      </div>
    </div>
  )
}

export default function ChartCard({ data }: { data: ChartData }) {
  const { chartType, title, xAxis, yAxis, labels = [], datasets = [], scatterData = [] } = data

  const axisStyle = { fontSize: 11, fill: '#7a89b8' }
  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e4e9f2' }
  const gridStroke = '#eef2f8'

  return (
    <div className="analysis-card">
      <div className="analysis-card-header">
        <span className="analysis-card-title">{title}</span>
      </div>
      <div className="analysis-card-body" style={{ paddingTop: 8 }}>
        {chartType === 'heatmap' ? (
          <HeatmapGrid
            xLabels={data.xLabels ?? []}
            yLabels={data.yLabels ?? []}
            values={data.values ?? []}
            unit={data.unit}
          />
        ) : null}
        {chartType !== 'heatmap' && <ResponsiveContainer width="100%" height={300}>
          {chartType === 'bar' || chartType === 'grouped_bar' ? (
            <BarChart data={buildGroupedData(labels, datasets)} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={axisStyle} label={xAxis ? { value: xAxis, position: 'insideBottom', offset: -2, style: axisStyle } : undefined} />
              <YAxis tick={axisStyle} label={yAxis ? { value: yAxis, angle: -90, position: 'insideLeft', style: axisStyle } : undefined} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((d, i) => <Bar key={d.label} dataKey={d.label} fill={color(d, i)} radius={[3, 3, 0, 0]} />)}
            </BarChart>
          ) : chartType === 'horizontal_bar' ? (
            <BarChart layout="vertical" data={buildGroupedData(labels, datasets)} margin={{ top: 4, right: 24, left: 48, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis type="number" tick={axisStyle} label={yAxis ? { value: yAxis, position: 'insideBottom', offset: -2, style: axisStyle } : undefined} />
              <YAxis type="category" dataKey="label" tick={axisStyle} width={80} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((d, i) => <Bar key={d.label} dataKey={d.label} fill={color(d, i)} radius={[0, 3, 3, 0]} />)}
            </BarChart>
          ) : chartType === 'stacked_bar' ? (
            <BarChart data={buildGroupedData(labels, datasets)} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((d, i) => <Bar key={d.label} dataKey={d.label} stackId="a" fill={color(d, i)} />)}
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={buildGroupedData(labels, datasets)} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((d, i) => <Line key={d.label} type="monotone" dataKey={d.label} stroke={color(d, i)} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />)}
            </LineChart>
          ) : chartType === 'radar' ? (
            <RadarChart data={labels.map((label, i) => {
              const row: Record<string, string | number> = { label }
              datasets.forEach(d => { row[d.label] = d.data[i] ?? 0 })
              return row
            })}>
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis dataKey="label" tick={{ ...axisStyle, fontSize: 10 }} />
              <PolarRadiusAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((d, i) => (
                <Radar key={d.label} name={d.label} dataKey={d.label} stroke={color(d, i)} fill={color(d, i)} fillOpacity={0.15} />
              ))}
            </RadarChart>
          ) : chartType === 'scatter' ? (
            <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="x" type="number" name={xAxis ?? 'x'} tick={axisStyle} label={xAxis ? { value: xAxis, position: 'insideBottom', offset: -2, style: axisStyle } : undefined} />
              <YAxis dataKey="y" type="number" name={yAxis ?? 'y'} tick={axisStyle} label={yAxis ? { value: yAxis, angle: -90, position: 'insideLeft', style: axisStyle } : undefined} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {scatterData.map((s, i) => (
                <Scatter key={s.series} name={s.series} data={s.points} fill={s.color ?? PALETTE[i % PALETTE.length]} fillOpacity={0.7} />
              ))}
            </ScatterChart>
          ) : <BarChart data={[]} />}
        </ResponsiveContainer>}
      </div>
    </div>
  )
}
