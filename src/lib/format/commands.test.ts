import { test, expect } from 'vitest';
import { anchorForRange, removeLinksInSelection } from './commands';

// Un renglón del editor: el <a> vive adentro de la caja editable.
function row(html) {
	const root = document.createElement('div');
	root.className = 'block-editable';
	root.innerHTML = html;
	document.body.replaceChildren(root);
	return root;
}

function rangeOver(node) {
	const range = document.createRange();
	range.selectNodeContents(node);
	return range;
}

test('encuentra el enlace con el cursor adentro', () => {
	const root = row('hola <a href="https://uno.com">sitio</a> chau');
	const range = document.createRange();
	const inside = root.querySelector('a').firstChild;
	range.setStart(inside, 2);
	range.collapse(true);
	expect(anchorForRange(range)?.getAttribute('href')).toBe('https://uno.com');
});

// El caso que estaba roto: marcar la palabra enlazada deja como ancestro común
// al renglón, no al <a>, así que subir por los padres no lo encontraba. Sin
// esto, el cuadrito se abría sin la dirección actual y sin el botón Quitar.
test('encuentra el enlace cuando lo marcado es la palabra enlazada entera', () => {
	const root = row('<a href="https://dos.com">sitio</a>');
	expect(anchorForRange(rangeOver(root))?.getAttribute('href')).toBe('https://dos.com');
});

// Arrastrar suele llevarse un espacio de más al final; eso no tiene que dejar
// de reconocer el enlace.
test('lo encuentra aunque la marca arrastre espacios de sobra', () => {
	const root = row('<a href="https://tres.com">sitio</a>  ');
	expect(anchorForRange(rangeOver(root))?.getAttribute('href')).toBe('https://tres.com');
});

// Si sobra texto alrededor, el gesto es "enlazá todo esto", no "editá ese
// enlace": devolver el <a> de adentro dejaría el resto sin enlazar.
test('no lo devuelve si lo marcado excede el texto del enlace', () => {
	const root = row('hola <a href="https://cuatro.com">sitio</a> chau');
	expect(anchorForRange(rangeOver(root))).toBe(null);
});

test('sin enlace y sin nada marcado devuelve null', () => {
	const root = row('hola chau');
	expect(anchorForRange(rangeOver(root))).toBe(null);
	expect(anchorForRange(null)).toBe(null);
});

// --- removeLinksInSelection: lo que usa "Quitar formato" ---

function select(range) {
	const sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
}

test('marcar media palabra enlazada se lleva el enlace entero', () => {
	const root = row('<a href="https://uno.com">enlazado</a>');
	const range = document.createRange();
	const text = root.querySelector('a').firstChild;
	range.setStart(text, 2);
	range.setEnd(text, 5);
	select(range);

	removeLinksInSelection();
	expect(root.querySelectorAll('a')).toHaveLength(0);
	expect(root.textContent).toBe('enlazado');
});

test('se lleva TODOS los enlaces que toca la selección, no sólo el primero', () => {
	const root = row('<a href="https://uno.com">uno</a> y <a href="https://dos.com">dos</a>');
	select(rangeOver(root));

	removeLinksInSelection();
	expect(root.querySelectorAll('a')).toHaveLength(0);
	expect(root.textContent).toBe('uno y dos');
});

test('no toca un enlace que quedó fuera de lo marcado', () => {
	const root = row('<a href="https://uno.com">uno</a> y <a href="https://dos.com">dos</a>');
	select(rangeOver(root.querySelector('a')));

	removeLinksInSelection();
	const quedan = root.querySelectorAll('a');
	expect(quedan).toHaveLength(1);
	expect(quedan[0].getAttribute('href')).toBe('https://dos.com');
});
