// Tag name hygiene (specs/006). Tags are reusable entities, so "#Trabajo",
// "trabajo" and "trabajo " must resolve to one tag, not three. Display keeps
// the user's casing; matching ignores case and accents.

export function normalizeTagName(name) {
	return (name ?? '').trim().replace(/^#/, '').trim().replace(/\s+/g, ' ');
}

function comparable(name) {
	return normalizeTagName(name)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

export function tagNamesMatch(a, b) {
	return comparable(a) === comparable(b);
}
