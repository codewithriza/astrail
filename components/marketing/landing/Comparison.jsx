import SectionHeading from './SectionHeading'

const rows = [
  ['Time to first endpoint', 'Setup effort', 'Minutes', 'Weeks', 'N/A'],
  ['Source coverage', 'What can be imported', 'OpenAPI, Swagger, Google Discovery, GraphQL, websites', 'Whatever you build', 'Only text context'],
  ['Deterministic execution', 'How requests run', 'Endpoint maps', 'Depends on code', 'Model guesses'],
  ['Auth boundaries', 'Credential handling', 'Scoped, managed', 'Custom code', 'Keys in prompts'],
  ['Hosting, logs & limits', 'Production runtime', 'Included', 'You maintain', 'None'],
  ['Code export', 'Ownership', 'Full codebase', '—', '—'],
  ['Maintenance', 'Ongoing work', 'Managed', 'Ongoing', 'Manual'],
]

export default function Comparison() {
  return (
    <section className="section container" aria-labelledby="compare-title">
      <SectionHeading
        id="compare-title"
        title="Why teams pick Astrail"
        link="Full breakdown"
        linkHref="#faq"
        copy="What you get versus building an MCP server yourself or handing an AI your docs"
      />
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col" className="hl">Astrail</th>
              <th scope="col">DIY MCP server</th>
              <th scope="col">Docs + prompting</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, note, astrail, diy, docs]) => (
              <tr key={name}>
                <th scope="row">
                  {name}
                  <small>{note}</small>
                </th>
                <td className="hl">{astrail}</td>
                <td>{diy}</td>
                <td>{docs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        *Astrail column reflects hosted runtime defaults. &apos;—&apos; means the approach doesn&apos;t cover it.
      </p>
    </section>
  )
}
