'use strict';

const { consultarUna } = require('../datos/bd');

function isoFecha(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dia;
}

async function periodoAbierto() {
  return consultarUna(`SELECT * FROM periodos WHERE estado <> 'CERRADO' LIMIT 1`);
}

async function sugerirSiguientePeriodo() {
  const ultimo = await consultarUna(
    `SELECT anio, mes FROM periodos ORDER BY anio DESC, mes DESC LIMIT 1`
  );
  let anio;
  let mes;
  if (ultimo) {
    anio = ultimo.anio;
    mes = ultimo.mes + 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  } else {
    const hoy = new Date();
    anio = hoy.getFullYear();
    mes = hoy.getMonth() + 1;
  }
  const inicio = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 0);
  const vencimiento = new Date(anio, mes, 20);
  return {
    anio: anio,
    mes: mes,
    fechaInicio: isoFecha(inicio),
    fechaFin: isoFecha(fin),
    fechaVencimiento: isoFecha(vencimiento),
  };
}

module.exports = { periodoAbierto, sugerirSiguientePeriodo };
