import { useState } from 'react'
import SectionHeading from './SectionHeading'

const samples = [
  {
    label: 'CLI',
    language: 'shell',
    code: `# Run from your Astrail checkout. Use an endpoint you created.
export ASTRAIL_MCP_ENDPOINT='https://YOUR_HOST/api/mcp/YOUR_SERVER_ID'
export ASTRAIL_API_KEY='YOUR_API_KEY'
node bin/astrail.mjs status
node bin/astrail.mjs tools list`,
  },
  {
    label: 'HTTP',
    language: 'shell',
    code: `# Set ASTRAIL_MCP_ENDPOINT and ASTRAIL_API_KEY first.
curl --fail-with-body "$ASTRAIL_MCP_ENDPOINT" \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
  },
  {
    label: 'MCP stdio',
    language: 'json',
    code: `{
  "mcpServers": {
    "astrail": {
      "command": "node",
      "args": ["/absolute/path/to/astrail/bin/astrail.mjs", "mcp"],
      "env": {
        "ASTRAIL_MCP_ENDPOINT": "https://YOUR_HOST/api/mcp/YOUR_SERVER_ID",
        "ASTRAIL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}`,
  },
]

export default function Clients() {
  const [active, setActive] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const sample = samples[active]

  async function copySample() {
    try {
      await navigator.clipboard.writeText(sample.code)
      setCopyStatus('Copied to clipboard.')
    } catch {
      setCopyStatus('Copy unavailable. Select the code and copy it manually.')
    }
  }

  return (
    <section className="section container" aria-labelledby="clients-title">
      <SectionHeading
        id="clients-title"
        title="Connect your MCP client"
        copy="Use your own endpoint with the CLI, HTTP, or the stdio bridge. Replace the placeholders before running these examples."
      />
      <div className="code-toolbar">
        <div className="code-tabs" role="group" aria-label="Connection example">
          {samples.map((item, index) => (
            <button
              key={item.label}
              aria-pressed={active === index}
              onClick={() => { setActive(index); setCopyStatus('') }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="lang-chip">{sample.language}</span>
      </div>
      <div className="code-block">
        <button className="code-copy" type="button" onClick={copySample}>Copy example</button>
        <pre><code>{sample.code}</code></pre>
      </div>
      <p role="status" aria-live="polite">{copyStatus}</p>
    </section>
  )
}
