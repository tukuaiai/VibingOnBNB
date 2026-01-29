import { useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'

type StepType = 'swap' | 'deposit'

type Step = {
  id: string
  type: StepType
  title: string
  params: Record<string, string>
}

type Strategy = {
  id: string
  prompt: string
  chain: string
  steps: Step[]
  createdAt: string
  version: string
}

type PaletteState = {
  stepId: string
  field: string
  options: string[]
}

const fieldOptions: Record<string, string[]> = {
  tokenIn: ['USDT', 'USDC', 'WBNB'],
  tokenOut: ['WBNB', 'BTCB', 'ETH'],
  amount: ['10%', '25%', '50%', '100%'],
  slippage: ['0.1%', '0.3%', '0.5%', '1%'],
  protocol: ['Aave v3', 'Venus', 'Radiant'],
  asset: ['WBNB', 'USDT', 'BTCB']
}

const makeStrategy = (prompt: string): Strategy => {
  const id = `strat_${Date.now()}`
  const normalized = prompt.toLowerCase()
  const preferEth = normalized.includes('eth')
  const tokenOut = preferEth ? 'ETH' : 'WBNB'

  return {
    id,
    prompt: prompt || '把 USDT 换成 WBNB 并存入借贷池',
    chain: 'bnb-testnet',
    createdAt: new Date().toISOString(),
    version: 'v0',
    steps: [
      {
        id: 'step_swap',
        type: 'swap',
        title: 'Swap',
        params: {
          tokenIn: 'USDT',
          tokenOut,
          amount: '50%',
          slippage: '0.5%'
        }
      },
      {
        id: 'step_deposit',
        type: 'deposit',
        title: 'Deposit',
        params: {
          protocol: 'Aave v3',
          asset: tokenOut,
          amount: '100%'
        }
      }
    ]
  }
}

const encodeStrategy = (strategy: Strategy) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(strategy))))

const decodeStrategy = (encoded: string) =>
  JSON.parse(decodeURIComponent(escape(atob(encoded)))) as Strategy

function App() {
  const [prompt, setPrompt] = useState('')
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [saved, setSaved] = useState<Strategy[]>([])
  const [palette, setPalette] = useState<PaletteState | null>(null)
  const [runLog, setRunLog] = useState<string[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('infinit_saved_strategies')
    if (stored) {
      setSaved(JSON.parse(stored))
    }

    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('strategy')
    if (encoded) {
      try {
        setStrategy(decodeStrategy(encoded))
      } catch {
        // ignore invalid share link
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('infinit_saved_strategies', JSON.stringify(saved))
  }, [saved])

  const nodes = useMemo(() => {
    if (!strategy) return []
    return strategy.steps.map((step, idx) => ({
      id: step.id,
      position: { x: 120 + idx * 260, y: 80 },
      data: {
        label: `${step.title}`
      },
      style: {
        borderRadius: 16,
        border: '1px solid var(--ink-200)',
        padding: 16,
        fontWeight: 600,
        background: 'var(--panel)'
      }
    }))
  }, [strategy])

  const edges = useMemo(() => {
    if (!strategy || strategy.steps.length < 2) return []
    return [
      {
        id: 'edge-swap-deposit',
        source: strategy.steps[0].id,
        target: strategy.steps[1].id,
        animated: true
      }
    ]
  }, [strategy])

  const openPalette = (stepId: string, field: string) => {
    setPalette({ stepId, field, options: fieldOptions[field] || [] })
  }

  const applyOption = (option: string) => {
    if (!palette || !strategy) return
    setStrategy({
      ...strategy,
      steps: strategy.steps.map((step) =>
        step.id === palette.stepId
          ? { ...step, params: { ...step.params, [palette.field]: option } }
          : step
      )
    })
    setPalette(null)
  }

  const updateParam = (stepId: string, field: string, value: string) => {
    if (!strategy) return
    setStrategy({
      ...strategy,
      steps: strategy.steps.map((step) =>
        step.id === stepId
          ? { ...step, params: { ...step.params, [field]: value } }
          : step
      )
    })
  }

  const saveStrategy = () => {
    if (!strategy) return
    setSaved((prev) => [strategy, ...prev.filter((s) => s.id !== strategy.id)])
  }

  const shareStrategy = async () => {
    if (!strategy) return
    const encoded = encodeStrategy(strategy)
    const url = `${window.location.origin}?strategy=${encoded}`
    window.history.replaceState({}, '', url)
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
    }
    setRunLog((prev) => [`分享链接已生成：${url}`, ...prev])
  }

  const runStrategy = async () => {
    if (!strategy) return
    setRunLog((prev) => ['开始执行策略（模拟）...', ...prev])
    for (const step of strategy.steps) {
      setRunLog((prev) => [`执行 ${step.title}...`, ...prev])
      await new Promise((r) => setTimeout(r, 700))
    }
    setRunLog((prev) => ['✅ 策略执行完成（模拟）', ...prev])
  }

  const generate = () => setStrategy(makeStrategy(prompt))

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">INFINIT · Prompt-to-DeFi</p>
          <h1>Smart Action Builder</h1>
          <p className="subhead">
            输入 Prompt → 引导式参数选择 → 策略保存 / 复执行 / 分享
          </p>
        </div>
        <div className="badge">/ 触发 Smart Action</div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Prompt</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例：把 USDT 换成 WBNB 并存入借贷池"
          />
          <div className="actions">
            <button className="primary" onClick={generate}>
              生成策略
            </button>
            <button className="ghost" onClick={saveStrategy} disabled={!strategy}>
              保存
            </button>
            <button className="ghost" onClick={shareStrategy} disabled={!strategy}>
              分享
            </button>
          </div>

          <div className="smart-actions">
            <h2>Smart Action 引导</h2>
            {strategy ? (
              strategy.steps.map((step) => (
                <div key={step.id} className="step-card">
                  <div className="step-header">
                    <span>{step.title}</span>
                    <span className="chip">{step.type}</span>
                  </div>
                  <div className="field-grid">
                    {Object.entries(step.params).map(([field, value]) => (
                      <label key={field}>
                        <span>{field}</span>
                        <input
                          value={value}
                          onChange={(e) => updateParam(step.id, field, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === '/') {
                              e.preventDefault()
                              openPalette(step.id, field)
                            }
                          }}
                          placeholder="输入 / 触发引导"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <button
                      className="tiny"
                      onClick={() => openPalette(step.id, Object.keys(step.params)[0])}
                    >
                      / 快捷选择
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="hint">先生成策略，再进行引导式配置。</p>
            )}
          </div>
        </section>

        <section className="panel flow-panel">
          <div className="flow-header">
            <h2>策略流</h2>
            <button className="primary" onClick={runStrategy} disabled={!strategy}>
              执行策略
            </button>
          </div>
          <div className="flow-canvas">
            {strategy ? (
              <ReactFlow nodes={nodes} edges={edges} fitView>
                <Background gap={20} color="var(--ink-100)" />
                <Controls />
              </ReactFlow>
            ) : (
              <div className="empty-state">暂无策略</div>
            )}
          </div>

          <div className="run-log">
            <h3>执行记录</h3>
            {runLog.length === 0 ? (
              <p className="hint">执行一次策略后会在这里记录过程。</p>
            ) : (
              <ul>
                {runLog.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="saved">
            <h3>已保存策略</h3>
            {saved.length === 0 ? (
              <p className="hint">暂无已保存策略。</p>
            ) : (
              <div className="saved-list">
                {saved.map((item) => (
                  <button key={item.id} onClick={() => setStrategy(item)}>
                    {item.prompt.slice(0, 18)}...
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {palette && (
        <div className="palette">
          <div className="palette-card">
            <div className="palette-header">
              选择 {palette.field}
              <button onClick={() => setPalette(null)}>关闭</button>
            </div>
            <div className="palette-options">
              {palette.options.map((opt) => (
                <button key={opt} onClick={() => applyOption(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
