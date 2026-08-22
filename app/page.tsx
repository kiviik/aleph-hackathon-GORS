import styles from "./landing.module.css";

const mobileUrl = process.env.NEXT_PUBLIC_MOBILE_DOWNLOAD_URL ?? "https://expo.dev/go";

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Navegación principal">
        <span className={styles.wordmark}>BA Estaciona</span>
        <span className={styles.navNote}>desktop local-first</span>
      </nav>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Demo para iPhone</p>
          <h1 className={styles.title}>Encontrá un lugar.<br /><em>Estacioná con evidencia.</em></h1>
          <p className={styles.lede}>
            La experiencia completa vive en tu teléfono. Esta página es el punto
            de entrada para BA Estaciona Mobile, una demo local-first para Calgary.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href={mobileUrl}>Probar en iPhone</a>
            <a className={styles.secondaryAction} href="#como-funciona">Qué incluye</a>
          </div>
          <p className={styles.platformNote}>Expo Go · iOS · datos locales · sin cuenta</p>
        </div>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.mapCard}>
            <div className={styles.mapGrid} />
            <div className={`${styles.street} ${styles.streetOne}`} />
            <div className={`${styles.street} ${styles.streetTwo}`} />
            <div className={`${styles.street} ${styles.streetThree}`} />
            <span className={`${styles.pin} ${styles.pinOne}`}>✓</span>
            <span className={`${styles.pin} ${styles.pinTwo}`}>✓</span>
            <span className={`${styles.pin} ${styles.pinThree}`}>?</span>
            <div className={styles.mapLabel}><strong>4 lugares</strong><span>cerca de vos</span></div>
          </div>
        </div>
      </section>

      <section className={styles.features} id="como-funciona">
        <article><span>01</span><h2 className={styles.featureTitle}>Mapa nativo</h2><p>Encontrá espacios libres en Calgary con una experiencia diseñada para una mano.</p></article>
        <article><span>02</span><h2 className={styles.featureTitle}>Street View adentro</h2><p>Explorá la cuadra en una pestaña integrada, sin saltar a Safari.</p></article>
        <article><span>03</span><h2 className={styles.featureTitle}>Memoria local</h2><p>Favoritos y lugares más buscados quedan guardados solo en tu teléfono.</p></article>
      </section>

      <footer className={styles.footer}>
        <span>BA Estaciona · QVAC Track 2</span>
        <span>La web orienta. El teléfono hace el trabajo.</span>
      </footer>
    </main>
  );
}
