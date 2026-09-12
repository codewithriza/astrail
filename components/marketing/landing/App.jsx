import Navbar from './Navbar'
import Hero from './Hero'
import Clients from './Clients'
import Comparison from './Comparison'
import Features from './Features'
import Specs from './Specs'
import Pricing from './Pricing'
import Faq from './Faq'
import Outro from './Outro'
import Footer from './Footer'

function App() {
  return (
    <div id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <Navbar />
      <main id="main">
        <Hero />
        <Clients />
        <Comparison />
        <Features />
        <Specs />
        <Pricing />
        <Faq />
        <Outro />
      </main>
      <Footer />
    </div>
  )
}

export default App
