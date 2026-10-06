export default function SectionHeading({ title, id }: { title: string; id?: string }) {
  return <h2 id={id} className="section-heading">{title}</h2>
}
