// Un ZIP de verdad, con el método STORE y nada más (spec 041 §5.2).
//
// Sin librería, por tres motivos en este orden: una bomba zip se vuelve
// IMPOSIBLE por construcción —sin compresión, el tamaño declarado no puede
// mentir sobre en qué se expande—; las capturas ya vienen comprimidas y
// apretarlas de nuevo no ahorra nada; y el proyecto tiene siete dependencias de
// ejecución en total (spec 015).
//
// ponytail: sin Zip64. Techo de 4 GB por archivo y 65535 entradas, muy por
// encima del tope de 5 MB por imagen. El día que haga falta, Zip64 son dos
// campos más en el directorio central.

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index++) {
		let value = index;
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

// La hora en el formato de MS-DOS que el ZIP arrastra desde 1989.
function dosStamp(date) {
	const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
	const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
	return { time, day };
}

export async function buildZip(entries, date = new Date()) {
	const { time, day } = dosStamp(date);
	const parts = [];
	const central = [];
	let offset = 0;

	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.name);
		const data = new Uint8Array(await entry.blob.arrayBuffer());
		const crc = crc32(data);

		const header = new DataView(new ArrayBuffer(30));
		header.setUint32(0, LOCAL, true);
		header.setUint16(4, 20, true); // versión necesaria
		header.setUint16(6, 0, true); // banderas
		header.setUint16(8, 0, true); // método 0 = STORE
		header.setUint16(10, time, true);
		header.setUint16(12, day, true);
		header.setUint32(14, crc, true);
		header.setUint32(18, data.length, true); // comprimido
		header.setUint32(22, data.length, true); // real — iguales, por eso no hay bomba
		header.setUint16(26, name.length, true);
		header.setUint16(28, 0, true); // extra
		parts.push(new Uint8Array(header.buffer), name, data);

		const record = new DataView(new ArrayBuffer(46));
		record.setUint32(0, CENTRAL, true);
		record.setUint16(4, 20, true);
		record.setUint16(6, 20, true);
		record.setUint16(8, 0, true);
		record.setUint16(10, 0, true);
		record.setUint16(12, time, true);
		record.setUint16(14, day, true);
		record.setUint32(16, crc, true);
		record.setUint32(20, data.length, true);
		record.setUint32(24, data.length, true);
		record.setUint16(28, name.length, true);
		record.setUint32(42, offset, true);
		central.push(new Uint8Array(record.buffer), name);

		offset += 30 + name.length + data.length;
	}

	const centralSize = central.reduce((total, part) => total + part.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, EOCD, true);
	end.setUint16(8, entries.length, true);
	end.setUint16(10, entries.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);
	return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
		type: 'application/zip'
	});
}

export function readZip(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// El final del directorio central se busca desde atrás: es lo único que el
	// formato garantiza que está al final.
	let end = -1;
	for (let index = bytes.length - 22; index >= 0; index--) {
		if (view.getUint32(index, true) === EOCD) {
			end = index;
			break;
		}
	}
	if (end < 0) return { status: 'not-a-package' };

	const count = view.getUint16(end + 10, true);
	let cursor = view.getUint32(end + 16, true);
	const entries = new Map();

	for (let index = 0; index < count; index++) {
		if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL)
			return { status: 'not-a-package' };
		if (view.getUint16(cursor + 10, true) !== 0) return { status: 'compressed-entry' };
		const nameLength = view.getUint16(cursor + 28, true);
		const extraLength = view.getUint16(cursor + 30, true);
		const commentLength = view.getUint16(cursor + 32, true);
		const size = view.getUint32(cursor + 24, true);
		const localOffset = view.getUint32(cursor + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
		if (entries.has(name)) return { status: 'duplicate-entry', name };

		if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL)
			return { status: 'not-a-package' };
		if (view.getUint16(localOffset + 8, true) !== 0) return { status: 'compressed-entry' };
		const dataStart =
			localOffset +
			30 +
			view.getUint16(localOffset + 26, true) +
			view.getUint16(localOffset + 28, true);
		if (dataStart + size > bytes.length) return { status: 'not-a-package' };
		entries.set(name, bytes.subarray(dataStart, dataStart + size));

		cursor += 46 + nameLength + extraLength + commentLength;
	}
	return { status: 'ok', entries };
}
