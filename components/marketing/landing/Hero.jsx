import { useState } from 'react'

const tabs = [
  { id: 'api', label: 'API', prompt: 'Turn this API spec into an MCP server my agent can call.' },
  { id: 'discovery', label: 'Discovery', prompt: 'Turn this Google Discovery document into agent tools.' },
  { id: 'website', label: 'Website', prompt: 'Turn this website into structured agent tools.' },
  { id: 'docs', label: 'Docs', prompt: 'Generate MCP tools from this documentation URL.' },
  { id: 'workflow', label: 'Workflow', prompt: 'Turn our purchasing workflow into callable actions.' },
]

const samples = ['Stripe API', 'Google Calendar', 'Internal CRM', 'Vendor portal']

export default function Hero() {
  const [active, setActive] = useState('api')
  const [prompt, setPrompt] = useState(tabs[0].prompt)
  const [previewVisible, setPreviewVisible] = useState(false)

  function selectTab(tab) {
    setActive(tab.id)
    setPrompt(tab.prompt)
    setPreviewVisible(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (prompt.trim()) setPreviewVisible(true)
  }

  return (
    <section className="hero container" id="product" aria-labelledby="hero-title">
     {/* <div className="backed">
        <span className="badge" aria-hidden="true">A</span>
        The action layer for AI agents
      </div> */}
      <h1 id="hero-title">Turn anything into an MCP server agents can call</h1>
      <p className="hero-sub">
        Astrail turns OpenAPI, Swagger, Google Discovery, GraphQL introspection,
        websites and company workflows into hosted MCP servers. Paste a contract
        or URL, get back one endpoint your agent can call.
      </p>
      <div className="hero-ctas">
        <a className="btn btn--dark" href="/signup">
          Build now -&gt;
        </a>
        <a className="btn btn--ghost" href="#runtime">
          How it works -&gt;
        </a>
      </div>

      <div className="playground" id="playground">
        <div className="demo">
          <div className="demo-tabs" role="tablist" aria-label="Source type">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active === tab.id}
                onClick={() => selectTab(tab)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="demo-card">
            <form className="demo-input" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="demo-prompt">
                Describe what to generate
              </label>
              <input
                id="demo-prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  setPreviewVisible(false)
                }}
              />
              <button className="demo-go" type="submit" aria-label="Preview MCP setup">
                →
              </button>
            </form>
            <div className={`demo-drop ${previewVisible ? 'is-done' : ''}`}>
              {previewVisible ? (
                <div>
                  <span className="up" aria-hidden="true">✓</span>
                  <span>Example only — create a server in the dashboard to get a live endpoint.</span>
                  <a href="/dashboard/generate">Open the generator →</a>
                </div>
              ) : (
                <div>
                  <span className="up" aria-hidden="true">↑</span>
                  <span>Interactive preview — enter a description above. No server is created here.</span>
                </div>
              )}
            </div>
            <div className="demo-try">
              Try one:
              {samples.map((sample) => (
                <button key={sample} type="button" onClick={() => { setPrompt(sample); setPreviewVisible(true) }}>
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="logo-strip" aria-label="Works with your existing stack">
        <span>Turn tools like these into agent actions</span>
        <div className="logo-row">
          {['OpenAPI', 'Google APIs', 'GitHub', 'Slack', 'Linear', 'Zendesk', 'Jira'].map((name) => (
            <strong key={name}>{name}</strong>
          ))}
        </div>
      </div>
    </section>
  )
}
