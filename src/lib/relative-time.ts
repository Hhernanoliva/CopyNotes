// "hace 2 min", en el idioma de la app. Lo usan el estado de datos del header y
// la señal de agentes en Configuración; la misma cuenta escrita dos veces se
// desincroniza sola.
export function haceCuanto(iso) {
	const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
	if (s < 60) return 'hace instantes';
	const m = Math.floor(s / 60);
	if (m < 60) return `hace ${m} min`;
	const h = Math.floor(m / 60);
	if (h < 24) return `hace ${h} h`;
	const d = Math.floor(h / 24);
	return `hace ${d} d`;
}
