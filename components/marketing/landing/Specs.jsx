import SectionHeading from './SectionHeading'

const specs = [
  ['Protocol', 'MCP (Streamable HTTP)'],
  ['Sources', 'OpenAPI, Swagger, Google Discovery, GraphQL introspection, Website alpha'],
  ['Hosted execution', 'Deterministic endpoint maps'],
  ['Runtime', 'No eval, native fetch'],
  ['Auth', 'Scoped credentials'],
  ['Logs & limits', 'Included'],
  ['Code export', 'Full generated codebase'],
]

export default function Specs() {
  return (
    <section className="section container" aria-labelledby="specs-title">
      <SectionHeading id="specs-title" title="Specs" />
      <div className="spec-rows">
        {specs.map(([label, value]) => (
          <div className="spec-row" key={label}>
            <span>{label}</span>
            <i aria-hidden="true" />
            <span>{value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
