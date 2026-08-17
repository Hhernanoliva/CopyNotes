// Ancho de la barra lateral en escritorio (arrastrable desde su borde derecho).
// Puro y sin DOM ni storage, igual que text-scale.ts, así corre bajo Node.
//
// En celular la barra es un cajón a pantalla casi completa y este ancho no se
// usa: el arrastre existe sólo a partir de md.

// 270 medido, no elegido: es lo que mide el encabezado de la barra (las cuatro
// pestañas más los dos botones). Un pixel menos y el botón "+" se derrama sobre
// el editor, así que la barra sólo puede ensancharse.
//
// ponytail: si alguna vez se quiere más angosta, primero tiene que achicarse ese
// encabezado (esconder el nombre de la pestaña activa); recién ahí baja este número.
export const MIN_WIDTH = 270;
export const MAX_WIDTH = 480; // más que esto y se come el editor
export const DEFAULT_WIDTH = MIN_WIDTH; // el ancho fijo que tenía antes de ser arrastrable

// Tirando el borde este tanto MÁS ADENTRO del mínimo, soltar cierra la barra.
// El margen existe para que pasarse tres pixeles no la cierre sin querer.
export const CLOSE_MARGIN = 60;

// Un valor guardado (o cualquier número suelto) llevado al rango permitido;
// lo que no sea un número usable cae en el default.
export function coerceWidth(value) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WIDTH;
	return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value)));
}

// Qué hacer con el borde en `px` (distancia del puntero al lado izquierdo de la
// barra) mientras se arrastra. Las dos mitades salen de la misma llamada a
// propósito: `width` es lo que se ve, `willClose` es lo que pasa al soltar, y si
// se calcularan por separado el atenuado podría mentir sobre el resultado.
export function resizeIntent(px) {
	return { width: coerceWidth(px), willClose: px < MIN_WIDTH - CLOSE_MARGIN };
}
