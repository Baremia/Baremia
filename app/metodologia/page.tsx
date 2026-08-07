import Link from "next/link";

export const metadata = {
  title: "Metodología | Baremia",
  description:
    "Cómo calcula Baremia las estimaciones de posición en procesos selectivos y qué datos son oficiales o estimados.",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #d9e2ef",
  borderRadius: 20,
  padding: 24,
};

export default function MetodologiaPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        color: "#10213d",
        padding: "32px 18px 64px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 860, margin: "0 auto" }}>
        <header style={{ marginBottom: 26 }}>
          <Link
            href="/"
            style={{ color: "#17467f", textDecoration: "none", fontWeight: 700 }}
          >
            ← Volver a Baremia
          </Link>
          <p
            style={{
              margin: "26px 0 8px",
              color: "#1d4ed8",
              fontWeight: 800,
              letterSpacing: "0.08em",
              fontSize: 12,
            }}
          >
            TRANSPARENCIA
          </p>
          <h1 style={{ fontSize: 36, margin: 0 }}>Cómo calcula Baremia</h1>
          <p style={{ color: "#52647d", lineHeight: 1.7, fontSize: 17 }}>
            Baremia combina información publicada oficialmente con un modelo estadístico
            para estimar la posición probable de una candidatura antes de que exista una
            clasificación definitiva. Una estimación no sustituye a los listados oficiales.
          </p>
        </header>

        <div style={{ display: "grid", gap: 18 }}>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>1. Datos oficiales</h2>
            <p style={{ lineHeight: 1.7, color: "#52647d" }}>
              La puntuación de la fase de oposición procede del listado oficial de personas
              aprobadas. Las plazas, los límites de puntuación y las reglas del concurso se
              obtienen de las bases y de sus correcciones oficiales.
            </p>
            <p style={{ lineHeight: 1.7, color: "#52647d", marginBottom: 0 }}>
              Cuando Baremia muestra un dato como <strong>oficial</strong>, no lo ha estimado:
              reproduce el dato asociado a esa candidatura en la documentación publicada.
            </p>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>2. Méritos antes de su publicación</h2>
            <p style={{ lineHeight: 1.7, color: "#52647d" }}>
              Mientras la Administración no publique los méritos de la OPE, Baremia utiliza
              como referencia estadística la bolsa oficial de empleo de Enfermería. Esa fuente
              contiene puntuaciones de experiencia y formación de decenas de miles de
              profesionales, con una fecha de corte anterior al proceso actual.
            </p>
            <p style={{ lineHeight: 1.7, color: "#52647d", marginBottom: 0 }}>
              El baremo de la bolsa y el de la OPE no son idénticos. Por eso las puntuaciones
              de la bolsa no se presentan como méritos oficiales de la OPE: se transforman y
              se utilizan únicamente como referencia para la estimación.
            </p>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>3. Coincidencia de candidaturas</h2>
            <p style={{ lineHeight: 1.7, color: "#52647d" }}>
              Cuando existe evidencia suficiente, Baremia relaciona una candidatura con una
              fila de la fuente de méritos mediante el nombre normalizado y el identificador
              anonimizado publicado. Los casos ambiguos no se fuerzan.
            </p>
            <p style={{ lineHeight: 1.7, color: "#52647d", marginBottom: 0 }}>
              Si no existe una coincidencia suficientemente fiable, los méritos se imputan de
              forma estadística a partir de candidatos comparables. Estos casos reciben un
              nivel de confianza menor y un intervalo de posición más amplio.
            </p>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>4. Validación histórica</h2>
            <p style={{ lineHeight: 1.7, color: "#52647d" }}>
              Baremia utiliza también resultados oficiales de procesos anteriores como
              referencia de validación. Para Enfermería Madrid se ha estructurado el concurso
              definitivo de la OPE anterior, separando experiencia y formación, y se compara
              con personas que aparecen también en la fuente actual de méritos.
            </p>
            <p style={{ lineHeight: 1.7, color: "#52647d", marginBottom: 0 }}>
              Esta información histórica ayuda a detectar transformaciones poco realistas,
              pero no se copia directamente al proceso actual: las bases y los méritos de cada
              convocatoria pueden cambiar.
            </p>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>5. Posición, rango y probabilidad</h2>
            <p style={{ lineHeight: 1.7, color: "#52647d" }}>
              La posición estimada se obtiene ordenando las puntuaciones totales estimadas
              dentro del cupo correspondiente. El rango refleja la incertidumbre del cálculo:
              cuanto menor es la evidencia individual disponible, mayor es el intervalo.
            </p>
            <p style={{ lineHeight: 1.7, color: "#52647d", marginBottom: 0 }}>
              La probabilidad de plaza es una medida orientativa derivada de la posición, las
              plazas aplicables y la incertidumbre. No representa una probabilidad oficial ni
              garantiza adjudicación.
            </p>
          </section>

          <section
            style={{
              ...card,
              borderColor: "#efc56b",
              background: "#fff9ea",
            }}
          >
            <h2 style={{ marginTop: 0, color: "#754400" }}>La estimación irá cambiando</h2>
            <p style={{ lineHeight: 1.7, color: "#754400", marginBottom: 0 }}>
              Cuando se publiquen méritos provisionales, alegaciones, correcciones, méritos
              definitivos o la relación final, Baremia actualizará el cálculo utilizando la
              información oficial más reciente. Cuanta más información oficial exista, menor
              será la parte estimada del resultado.
            </p>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Fuentes utilizadas en Enfermería Madrid</h2>
            <ul style={{ lineHeight: 1.9, color: "#52647d", paddingLeft: 22, marginBottom: 0 }}>
              <li>Bases oficiales de la convocatoria y correcciones publicadas.</li>
              <li>Listado definitivo de personas aprobadas y puntuación de oposición.</li>
              <li>Bolsa oficial de Enfermería utilizada como referencia estadística de méritos.</li>
              <li>Concurso definitivo de la OPE anterior utilizado para validación histórica.</li>
            </ul>
          </section>
        </div>

        <p style={{ marginTop: 28, color: "#65758b", lineHeight: 1.6, fontSize: 14 }}>
          Baremia es un servicio independiente y no está afiliado ni representa a la Comunidad
          de Madrid ni al Servicio Madrileño de Salud. La documentación oficial de cada proceso
          prevalece siempre sobre cualquier estimación mostrada por la plataforma.
        </p>
      </div>
    </main>
  );
}
