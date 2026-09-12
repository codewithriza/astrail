import Link from 'next/link'
import styles from './OpenSource.module.css'

const github = 'https://github.com/codewithriza/astrail'

export default function App() {
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Astrail home">astrail<span> / open source</span></Link>
        <nav aria-label="Main navigation"><Link href="/docs">Documentation</Link><a href={github}>GitHub ↗</a></nav>
      </header>
      <main id="main">
        <section className={styles.hero}>
          <p className={styles.eyebrow}><span /> Open source. MIT licensed.</p>
          <h1>Your APIs.<br /><em>Ready for agents.</em></h1>
          <p className={styles.intro}>Turn API definitions into MCP tools. Generate typed tools, define execution policies, and trace calls—all in one codebase you can run and change.</p>
          <div className={styles.actions}><a className={styles.primary} href={github}>Get the code <span aria-hidden="true">↗</span></a><Link className={styles.secondary} href="/docs">Read the docs <span aria-hidden="true">→</span></Link></div>
          <p className={styles.note}>Built by Riza and Aditya. Now yours to build on.</p>
        </section>
        <section className={styles.example} aria-labelledby="example-title">
          <div><p className={styles.eyebrow}>Start small</p><h2 id="example-title">One spec. Three tools.</h2><p>The offline example generates tools from a Notes API definition and validates their policies. No account, database, or API key needed.</p><a href={`${github}/tree/main/examples/openapi-to-tools`}>Explore the example ↗</a></div>
          <div className={styles.terminal}><div className={styles.terminalTitle}>QUICK START <span>Node.js 22.18+</span></div><pre><code>{`git clone https://github.com/codewithriza/astrail.git
cd astrail
npm ci
npm run demo:offline`}</code></pre><div className={styles.results}><p><code>notes_list_notes</code><span>allow</span></p><p><code>notes_create_note</code><span>approval</span></p><p><code>notes_delete_note</code><span>block</span></p></div><p className={styles.caption}>No upstream calls executed.</p></div>
        </section>
        <section className={styles.features} aria-label="What is included">
          <article><span>01 / Generate</span><h2>Start with your API.</h2><p>Import OpenAPI, Google Discovery, GraphQL, or an existing HTTP MCP server.</p></article>
          <article><span>02 / Control</span><h2>Make calls explicit.</h2><p>Endpoint maps, authentication, approvals, and network policies govern execution.</p></article>
          <article><span>03 / Build</span><h2>Take it from here.</h2><p>A dashboard, CLI, TypeScript and Python clients, and the source to extend them.</p></article>
        </section>
        <section className={styles.docs}><h2>The code is open.<br />The docs are here.</h2><p>Start with the offline example, then configure your own deployment. Persistent operation needs backend and authentication setup.</p><div><Link href="/docs">Browse documentation →</Link><a href={`${github}#current-boundaries`}>Read current limitations ↗</a></div></section>
      </main>
      <footer className={styles.footer}><span>Astrail · MIT license</span><div><a href={github}>GitHub</a><a href="https://discord.com/invite/2ThMPM2UWm">Discord</a><a href="https://x.com/getastrail">X</a></div></footer>
    </div>
  )
}
