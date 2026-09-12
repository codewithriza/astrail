import SectionHeading from './SectionHeading'

const plans = [
  {
    id: 'free',
    name: 'Free',
    monthly: '$0',
    description: 'Great for small teams getting started.',
    features: ['1 MCP generation / month', '3 hosted endpoints', '50 tool calls'],
    cta: 'Start free',
  },
  {
    id: 'starter',
    name: 'Launch',
    monthly: '$19',
    description: 'For fast-growing teams who are scaling.',
    features: ['25 MCP generations / month', '10 hosted endpoints', '20,000 tool calls'],
    cta: 'Choose Launch',
    highlight: true,
  },
  {
    id: 'team',
    name: 'Scale',
    monthly: '$99',
    description: 'Great for enterprises that need scale.',
    features: [
      '150 MCP generations / month',
      '100 hosted endpoints',
      '200,000 tool calls',
    ],
    cta: 'Choose Scale',
  },
]

export default function Pricing() {
  return (
    <section className="section container" id="pricing" aria-labelledby="pricing-title">
      <SectionHeading
        id="pricing-title"
        title="Pricing"
        link="Pricing details"
        linkHref="#pricing"
        copy="Start free, scale when your agents do. Every plan includes hosted execution, logs, and exportable code"
      />
      <div className="plans">
        {plans.map((plan) => (
          <article className={`plan ${plan.highlight ? 'plan--hl' : ''}`} key={plan.name}>
            <div className="plan-name">
              {plan.name}
              {plan.highlight && <span>MOST POPULAR</span>}
            </div>
            <div className="plan-price">
              {plan.monthly}
              {plan.name !== 'Free' && <small> / month</small>}
            </div>
            <p className="plan-desc">{plan.description}</p>
            <a className={`btn ${plan.highlight ? 'btn--dark' : 'btn--ghost'}`} href={plan.id === 'free' ? '/signup' : `/signup?plan=${plan.id}`}>
              {plan.cta} -&gt;
            </a>
            <div className="plan-feats">
              {plan.features.map((feature) => (
                <div key={feature}>
                  <b>✓</b>
                  {feature}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="table-note">Hosted plans are billed monthly. Tool-call limits reset monthly.</p>
    </section>
  )
}
