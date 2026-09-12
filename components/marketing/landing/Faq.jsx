import { useState } from 'react'
import SectionHeading from './SectionHeading'

const faqs = [
  {
    question: 'What does Astrail actually do?',
    answer:
      'Astrail turns your API, docs, or website into a hosted MCP endpoint that AI agents can use. Instead of spending weeks wiring auth, tool schemas, docs, hosting, SDKs, and usage limits, you get a working agent-ready interface much faster.',
  },
  {
    question: 'Why would my company need this?',
    answer:
      'If customers, internal teams, or AI agents need to interact with your product, Astrail makes that access structured and reliable. It helps your tools become usable by AI systems without exposing messy APIs or forcing your team to maintain custom agent infrastructure.',
  },
  {
    question: 'Is it only for developers?',
    answer:
      'Developers get the most control, but Astrail is built so teams can move without turning every integration into an engineering project. Product, ops, and growth teams can define what needs to be exposed, while engineering keeps control over security, credentials, and production behavior.',
  },
  {
    question: 'How is Astrail different from just giving an AI model our docs?',
    answer:
      'Docs help an AI understand your product. Astrail gives the AI something it can actually use. It creates structured tools, hosted endpoints, SDKs, and runtime controls, so agents can take real actions instead of only reading pages and guessing.',
  },
  {
    question: 'How fast can we get started?',
    answer:
      'You can start with an API spec, a docs URL, or a website. Astrail generates the first working MCP endpoint in minutes, and your team can review, refine, secure, and ship it. The goal is not a demo that looks good once — it is a production path your team can build on.',
  },
]

export default function Faq() {
  const [open, setOpen] = useState(-1)

  return (
    <section className="section container" id="faq" aria-labelledby="faq-title">
      <SectionHeading
        id="faq-title"
        title="FAQs"
        link="All FAQs"
        linkHref="/docs#quickstart"
        copy="Here are answers to the most common things people ask before getting started"
      />
      <div className="faq-list">
        {faqs.map((item, index) => {
          const isOpen = open === index
          return (
            <div className={`faq-item ${isOpen ? 'is-open' : ''}`} key={item.question}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  onClick={() => setOpen(isOpen ? -1 : index)}
                >
                  {item.question}
                  <i aria-hidden="true">⌄</i>
                </button>
              </h3>
              <div className="faq-panel" id={`faq-panel-${index}`} hidden={!isOpen}>
                <p>{item.answer}</p>
              </div>
            </div>
          )
        })}
      </div>
      <p className="faq-more">
        Have more questions? <a href="https://discord.gg/2ThMPM2UWm">Talk to the team</a>.
      </p>
    </section>
  )
}
