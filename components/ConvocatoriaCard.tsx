import Link from "next/link";

type ConvocatoriaCardProps = {
  href: string;
  title: string;
  administration: string;
  status: string;
  description: string;
  places: string;
};

export default function ConvocatoriaCard({
  href,
  title,
  administration,
  status,
  description,
  places,
}: ConvocatoriaCardProps) {
  return (
    <article className="convocatoria-card">
      <div>
        <span className="convocatoria-status">{status}</span>

        <h3>{title}</h3>

        <p>{administration}</p>

        <p>{description}</p>

        <p>
          <strong>{places}</strong>
        </p>
      </div>

      <Link href={href} className="button button-primary">
        Consultar convocatoria
      </Link>
    </article>
  );
}
