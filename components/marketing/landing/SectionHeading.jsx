export default function SectionHeading({ title, copy, link, linkHref = '#top', id }) {
  return (
    <>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {link && (
          <a className="head-link" href={linkHref}>
            {link} -&gt;
          </a>
        )}
      </div>
      {copy && <p className="section-sub">{copy}</p>}
    </>
  )
}
