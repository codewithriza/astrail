import Logo from './Logo'

const links = [
  ['pricing', '#pricing'],
  ['runtime', '#runtime'],
  ['faq', '#faq'],
  ['discord', '#community'],
  ['sign in', '/signup'],
]

export default function Navbar() {
  return (
    <header className="nav-shell">
      <nav className="nav container" aria-label="Main navigation">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <span className="beta-pill">Beta</span>
        </div>
        <div className="nav-links">
          {links.map(([label, href]) => (
            <a key={label} href={href}>
              {label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  )
}
