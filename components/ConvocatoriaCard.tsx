import Link from "next/link";

type ConvocatoriaCardProps = {
  title: string;
  location: string;
  status: string;
  href: string;
};

export default function ConvocatoriaCard({
  title,
  location,
  status,
  href,
}: ConvocatoriaCardProps) {
  return (
    <article className="convocatoria-card">
      <div>
        <span className="convocatoria-status">{status}</span>

        <h3>{title}</h3>

        <p>{location}</p>
      </div>

      <Link href={href} className="button button-primary">
        Consultar convocatoria
      </Link>
    </article>
  );
}
