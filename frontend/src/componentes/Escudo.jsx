import escudo from '../assets/escudo-santa-fe.png';

export function Escudo({ tam = 104, compacto = false }) {
  const alto = Math.round(tam * 1.22);
  return (
    <figure className={'escudo-bloque' + (compacto ? ' compacto' : '')} style={{ '--escudo': `${tam}px` }}>
      <span className="escudo-marca-marco">
        <img
          className="escudo-marca"
          src={escudo}
          alt="Escudo del Parcelamiento Santa Fe"
          width={tam * 2}
          height={alto * 2}
          decoding="async"
        />
      </span>
      <figcaption className="escudo-autor">
        <span>Autor</span>
        Rufino Carreto
      </figcaption>
    </figure>
  );
}
