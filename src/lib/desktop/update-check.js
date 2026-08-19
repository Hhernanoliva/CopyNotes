// Todo lo que hay que saber para pintar la sección de Actualizaciones, sin
// tocar Tauri ni el DOM. Lo usan tres lugares: el componente, el estado
// compartido, y `scripts/changelog-section.mjs` (que corre en node, por eso
// este archivo no importa nada de SvelteKit).

// Saca de CHANGELOG.md el cuerpo de una versión: desde su `## X.Y.Z` hasta el
// `##` siguiente, o hasta el final si es la última.
//
// La comparación es EXACTA y no un `startsWith`: con prefijos, pedir 0.2.1
// devolvía lo de 0.2.10, y publicar las novedades de otra versión es peor que
// no publicar ninguna.
export function changelogSection(markdown, version) {
	const lines = String(markdown ?? '').split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) return '';
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s/.test(line));
	return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

// El cuerpo puede venir con viñetas, con títulos, o suelto. Las tres formas
// tienen que leerse bien: lo escribe una persona, no un generador.
export function parseNotes(body) {
	const lines = String(body ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	const bullets = lines
		.filter((line) => /^[-*+]\s+/.test(line))
		.map((line) => line.replace(/^[-*+]\s+/, ''));
	if (bullets.length) return bullets;

	return lines.filter((line) => !line.startsWith('#'));
}

// Parte un renglón del changelog en pedazos marcados, para que el componente
// pinte cada uno con `<strong>`, `<em>`, `<code>` o pelado.
//
// Las tres marcas juntas y no sólo la negrita: el changelog se escribe en
// Markdown porque el MISMO texto es el cuerpo de la release en GitHub, donde las
// tres se ven. Soportar una sola deja el bug vivo para las otras dos — de hecho
// ya estaba vivo, con `*cursiva*` y `` `código` `` a la vista en la 0.2.1.
//
// Devuelve pedazos y NO html: el texto sale del changelog embebido pero también
// del `latest.json`, o sea de la red. Meterlo con `{@html}` sería abrir un
// agujero por una negrita. Ver la regla de `block.html` en AGENT.md.
//
// El orden del alternado importa: `**` va antes que `*` o `**hola**` se leería
// como una cursiva vacía seguida de basura. Y cada marca pide al menos un
// carácter adentro (`.+?`), así un asterisco suelto o sin cerrar queda como
// texto: comerse medio renglón por un símbolo perdido es peor que mostrarlo.
const MARKS = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

export function inlineMarks(text) {
	const source = String(text ?? '');
	const out = [];
	let last = 0;
	for (const match of source.matchAll(MARKS)) {
		if (match.index > last) out.push({ text: source.slice(last, match.index), mark: null });
		const mark = match[1] !== undefined ? 'bold' : match[2] !== undefined ? 'italic' : 'code';
		out.push({ text: match[1] ?? match[2] ?? match[3], mark });
		last = match.index + match[0].length;
	}
	if (last < source.length) out.push({ text: source.slice(last), mark: null });
	return out;
}

// Traduce lo que contestó `check()` a lo que hay que pintar.
//
// Son TRES estados, no dos, y el tercero es el que se suele hacer mal: no haber
// podido preguntar (sin internet, GitHub caído) no es un error del usuario. No
// hay nada que arreglar ni nada que decidir, así que se muestra la versión que
// tiene y se calla — un cartel rojo ahí sería ruido puro.
//
// `current` y `latest` son campos separados incluso cuando valen lo mismo: la
// pantalla dice las dos cosas a la vez, y un solo campo terminaría anunciando
// como instalada la versión que justamente todavía no lo está.
export function describeUpdate({ current, update, failed = false }) {
	if (failed) return { state: 'sin-respuesta', current, latest: current, notes: [] };
	if (!update?.available) return { state: 'al-dia', current, latest: current, notes: [] };
	return {
		state: 'nueva',
		current,
		latest: update.version,
		notes: parseNotes(update.body)
	};
}
