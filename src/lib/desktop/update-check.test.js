import { describe, it, expect } from 'vitest';
import { changelogSection, describeUpdate, inlineMarks, parseNotes } from './update-check';

const CHANGELOG = `# Novedades

## 0.2.10

- Lo de la diez

## 0.2.1

- El menú abre en el celular
- Los enlaces se clickean

## 0.2.0

- Primera versión de escritorio
`;

describe('changelogSection', () => {
	it('saca la sección de una versión y corta en la siguiente', () => {
		expect(changelogSection(CHANGELOG, '0.2.1')).toBe(
			'- El menú abre en el celular\n- Los enlaces se clickean'
		);
	});

	it('la última sección llega hasta el final del archivo', () => {
		expect(changelogSection(CHANGELOG, '0.2.0')).toBe('- Primera versión de escritorio');
	});

	// 0.2.1 no puede quedarse con lo de 0.2.10 por empezar igual: publicar las
	// novedades equivocadas es peor que no publicar ninguna.
	it('no confunde una versión con otra que la tiene de prefijo', () => {
		expect(changelogSection(CHANGELOG, '0.2.1')).not.toContain('Lo de la diez');
		expect(changelogSection(CHANGELOG, '0.2.10')).toBe('- Lo de la diez');
	});

	it('devuelve vacío si la versión no está', () => {
		expect(changelogSection(CHANGELOG, '9.9.9')).toBe('');
		expect(changelogSection('', '0.2.0')).toBe('');
		expect(changelogSection(undefined, '0.2.0')).toBe('');
	});
});

describe('describeUpdate', () => {
	it('anuncia la versión nueva sin perder de vista la instalada', () => {
		const r = describeUpdate({
			current: '0.2.0',
			update: { available: true, version: '0.2.1', body: '- Arreglo A\n- Arreglo B' }
		});
		expect(r.state).toBe('nueva');
		// Las dos, y distintas: el texto dice "tenés la 0.2.0" y "hay 0.2.1".
		expect(r.current).toBe('0.2.0');
		expect(r.latest).toBe('0.2.1');
		expect(r.notes).toEqual(['Arreglo A', 'Arreglo B']);
	});

	it('dice que está al día cuando no hay nada nuevo', () => {
		for (const update of [null, { available: false }]) {
			const r = describeUpdate({ current: '0.2.0', update });
			expect(r.state).toBe('al-dia');
			expect(r.current).toBe('0.2.0');
			expect(r.latest).toBe('0.2.0');
		}
	});

	// Sin internet no es un error del usuario: no hay nada que arreglar y nada
	// que decidir. Se muestra la versión y se calla.
	it('no trata como error el no haber podido preguntar', () => {
		const r = describeUpdate({ current: '0.2.0', update: null, failed: true });
		expect(r.state).toBe('sin-respuesta');
		expect(r.current).toBe('0.2.0');
		expect(r.notes).toEqual([]);
	});

	it('una versión nueva sin notas escritas no rompe nada', () => {
		const r = describeUpdate({
			current: '0.2.0',
			update: { available: true, version: '0.2.1', body: '' }
		});
		expect(r.state).toBe('nueva');
		expect(r.latest).toBe('0.2.1');
		expect(r.notes).toEqual([]);
	});
});

// El changelog se escribe en Markdown porque el mismo texto es el cuerpo de la
// release en GitHub, donde las marcas se ven. Adentro de la app salían crudas
// (visto en la 0.2.0 instalada, 2026-08-19).
describe('inlineMarks', () => {
	it('separa lo que va en negrita de lo que no', () => {
		expect(inlineMarks('**Agentes de IA.** Podés conectar Claude Code')).toEqual([
			{ text: 'Agentes de IA.', mark: 'bold' },
			{ text: ' Podés conectar Claude Code', mark: null }
		]);
	});

	it('reconoce las tres marcas que usa el changelog', () => {
		expect(inlineMarks('**fuerte**, *suave* y `código`')).toEqual([
			{ text: 'fuerte', mark: 'bold' },
			{ text: ', ', mark: null },
			{ text: 'suave', mark: 'italic' },
			{ text: ' y ', mark: null },
			{ text: 'código', mark: 'code' }
		]);
	});

	// El orden del alternado: si `*` se probara antes que `**`, una negrita se
	// leería como cursiva vacía y el renglón saldría partido mal.
	it('la negrita gana sobre la cursiva, no al revés', () => {
		expect(inlineMarks('**dos asteriscos**')).toEqual([{ text: 'dos asteriscos', mark: 'bold' }]);
	});

	it('sin marcas devuelve un solo pedazo', () => {
		expect(inlineMarks('texto pelado')).toEqual([{ text: 'texto pelado', mark: null }]);
	});

	// Un símbolo suelto o sin cerrar es texto: comerse el resto del renglón por un
	// asterisco perdido es peor que mostrarlo tal cual.
	it('un símbolo sin pareja se queda como texto', () => {
		expect(inlineMarks('2 ** 3 es ocho')).toEqual([{ text: '2 ** 3 es ocho', mark: null }]);
		expect(inlineMarks('**sin cerrar')).toEqual([{ text: '**sin cerrar', mark: null }]);
		expect(inlineMarks('un ` solo')).toEqual([{ text: 'un ` solo', mark: null }]);
	});

	it('aguanta que no venga nada', () => {
		expect(inlineMarks(undefined)).toEqual([]);
		expect(inlineMarks('')).toEqual([]);
	});
});

describe('parseNotes', () => {
	it('acepta las tres viñetas que usa Markdown', () => {
		expect(parseNotes('- uno\n* dos\n+ tres')).toEqual(['uno', 'dos', 'tres']);
	});

	it('ignora renglones vacíos y títulos', () => {
		expect(parseNotes('## Novedades\n\n- uno\n\n- dos\n')).toEqual(['uno', 'dos']);
	});

	it('si no hay viñetas usa los renglones sueltos', () => {
		expect(parseNotes('Arreglamos el menú\nY los enlaces')).toEqual([
			'Arreglamos el menú',
			'Y los enlaces'
		]);
	});

	it('aguanta que no venga nada', () => {
		expect(parseNotes(undefined)).toEqual([]);
		expect(parseNotes('')).toEqual([]);
	});
});
