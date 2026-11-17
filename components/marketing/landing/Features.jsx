import SectionHeading from './SectionHeading'

export default function Features() {
  return (
    <>
      <section className="section container" id="runtime" aria-labelledby="det-title">
        <SectionHeading
          id="det-title"
          title="Deterministic by design"
          link="Runtime docs"
          linkHref='/docs'
          copy="Hosted execution uses deterministic endpoint maps — every tools/call maps to a real API request through native fetch, with no eval in the hosted runtime"
        />
        <div className="feature-panel">
          <div className="flow">
            <div className="flow-box">
              <b>tools/call</b>
              <span>agent invokes a tool</span>
            </div>
            <div className="flow-arrow" aria-hidden="true">→</div>
            <div className="flow-box flow-box--accent">
              <b>Endpoint map</b>
              <span>deterministic resolution — no eval, no guessing</span>
            </div>
            <div className="flow-arrow" aria-hidden="true">→</div>
            <div className="flow-box">
              <b>native fetch</b>
              <span>real API request, scoped auth</span>
            </div>
          </div>
          <div className="tools-demo">
            <div className="tool-line">
              <span className="m m--post">POST</span>
              <code>create_purchase_order</code>
              <span>/v1/orders · 182ms · logged</span>
            </div>
            <div className="tool-line">
              <span className="m m--get">GET</span>
              <code>check_inventory</code>
              <span>/v1/inventory · 96ms · logged</span>
            </div>
            <div className="tool-line">
              <span className="m m--patch">PATCH</span>
              <code>resolve_support_ticket</code>
              <span>/v1/tickets/:id · 143ms · logged</span>
            </div>
          </div>
          <p className="flow-caption">
            Every call is auditable: request, auth boundary, and response are logged.
          </p>
        </div>
      </section>

      <section className="section container" aria-labelledby="mcp-title">
        <SectionHeading
          id="mcp-title"
          title="MCP first, not MCP only"
          link="Architecture"
          linkHref="#arch"
          copy="MCP is the interface agents use today. Astrail's core is the runtime behind it: endpoint maps, auth boundaries, logs, and execution. If agent tool interfaces change, the same runtime can expose other adapters"
        />
        <div className="split">
          <div className="numbered-list">
            <div>
              <b>01</b>
              <span>
                <strong>Generated MCP code is exportable</strong>
                <em>Take the codebase and run it anywhere.</em>
              </span>
            </div>
            <div>
              <b>02</b>
              <span>
                <strong>Hosted execution uses deterministic endpoint maps</strong>
                <em>No model improvisation in production.</em>
              </span>
            </div>
            <div>
              <b>03</b>
              <span>
                <strong>No eval in the hosted runtime</strong>
                <em>Predictable, auditable execution paths.</em>
              </span>
            </div>
            <div>
              <b>04</b>
              <span>
                <strong>tools/call maps to real API requests</strong>
                <em>Through native fetch with scoped credentials.</em>
              </span>
            </div>
          </div>
          <div className="runtime-visual" aria-hidden="true">
            <div className="rv-row">
              <div className="rv-box">OpenAPI</div>
              <div className="rv-box">Google Discovery</div>
              <div className="rv-box">GraphQL</div>
              <div className="rv-box">Website</div>
            </div>
            <div className="rv-down">↓</div>
            <div className="rv-row">
              <div className="rv-box rv-box--core">Astrail runtime — endpoint maps · auth · logs</div>
            </div>
            <div className="rv-down">↓</div>
            <div className="rv-row">
              <div className="rv-box">MCP adapter</div>
              <div className="rv-box">Future adapters</div>
            </div>
            <div className="rv-log">
              <b>✓</b> tools/call create_purchase_order → POST /v1/orders → 201 Created
            </div>
          </div>
        </div>
      </section>

      <section className="section container" aria-labelledby="audience-title">
        <SectionHeading
          id="audience-title"
          title="Built for the whole team"
          copy="Technical and non-technical users building AI agents"
        />
        <div className="audience-row">
          <article>
            <b>01</b>
            <h3>Workflow owners</h3>
            <p>
              Ops, support, or supply chain managers driving purchasing,
              invoicing, inventory, vendor, and ticketing workflows.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Technical users</h3>
            <p>
              AI engineers or developers connecting agents to APIs, enterprise
              systems, and workflow tools.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Buyers</h3>
            <p>
              Founders, CTOs, COOs, or ops leaders owning onboarding,
              automation, and business workflows.
            </p>
          </article>
        </div>
      </section>

      <section className="section container" id="arch" aria-labelledby="arch-title">
        <SectionHeading
          id="arch-title"
          title="Architecture"
          link="Read more"
          linkHref="/docs"
          copy="A workflow/action runtime that generates agent tools from any source and executes them deterministically behind one hosted endpoint"
        />
        <div className="feature-panel">
          <div className="arch">
            <div className="arch-col">
              <div className="arch-box arch-box--in">OpenAPI / Swagger</div>
              <div className="arch-box arch-box--in">Google Discovery</div>
              <div className="arch-box arch-box--in">GraphQL introspection</div>
              <div className="arch-box arch-box--in">Docs URL</div>
              <div className="arch-box arch-box--in">Website</div>
            </div>
            <div className="flow-arrow" aria-hidden="true">→</div>
            <div className="arch-core-wrap">
              <span>ASTRAIL RUNTIME</span>
              <div className="arch-box arch-box--core">Tool generator</div>
              <div className="arch-box arch-box--core">Endpoint maps</div>
              <div className="arch-box arch-box--core">Auth boundaries</div>
              <div className="arch-box arch-box--core">Logs &amp; limits</div>
            </div>
            <div className="flow-arrow" aria-hidden="true">→</div>
            <div className="arch-col">
              <div className="arch-box arch-box--out">Hosted MCP endpoint</div>
              <div className="arch-box arch-box--out">Exportable codebase</div>
              <div className="arch-box arch-box--out">Future adapters</div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
