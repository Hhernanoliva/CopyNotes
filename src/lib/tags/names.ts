// Tag name hygiene (specs/006). Tags are reusable entities, so "#Trabajo",
// "trabajo" and "trabajo " must resolve to one tag, not three. Display keeps
// the user's casing; matching ignores case and accents.

export function normalizeTagName(name) {
	return (name ?? '').trim().replace(/^#/, '').trim().replace(/\s+/g, ' ');
}

// Exported so the picker's FILTER folds names exactly the way its "does this
// tag already exist?" check does. Two rules meant "cafe" listed nothing while
// the create option stayed hidden because "café" already existed — a dead end
// with no way out.
export function foldTagName(name) {
	return normalizeTagName(name)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

export function tagNamesMatch(a, b) {
	return foldTagName(a) === foldTagName(b);
}
