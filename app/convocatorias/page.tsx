export default function ConvocatoriasPage() {
  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "80px 24px",
      }}
    >
      <h1
        style={{
          fontSize: "48px",
          marginBottom: "16px",
        }}
      >
        Convocatorias disponibles
      </h1>

      <p
        style={{
          fontSize: "20px",
          color: "#6B7280",
          marginBottom: "50px",
        }}
      >
        Selecciona una convocatoria para estimar tu posición.
      </p>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "30px",
          background: "white",
        }}
      >
        <h2>Enfermería · Comunidad de Madrid</h2>

        <p
          style={{
            color: "#6B7280",
            marginTop: "10px",
            marginBottom: "24px",
          }}
        >
          Estimación basada en méritos oficiales y datos históricos.
        </p>

        <a
          href="/convocatorias/enfermeria-madrid"
          style={{
            display: "inline-block",
            background: "#2563EB",
            color: "white",
            padding: "14px 22px",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Comenzar estimación
        </a>
      </div>
    </main>
  );
}
