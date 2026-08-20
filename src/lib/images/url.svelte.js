// Una URL temporal por cuerpo, revocada cuando el renglón se va. Sin el revoke,
// una nota con veinte capturas deja veinte Blobs vivos hasta recargar.
import { getBody } from './bodies';

export function imageUrl(getImageId) {
	let url = $state(null);
	let missing = $state(false);

	$effect(() => {
		const imageId = getImageId();
		let revoked = false;
		let current = null;
		url = null;
		missing = false;
		if (!imageId) return;
		getBody(imageId).then((body) => {
			if (revoked) return;
			if (!body) {
				missing = true;
				return;
			}
			current = URL.createObjectURL(body.blob);
			url = current;
		});
		return () => {
			revoked = true;
			if (current) URL.revokeObjectURL(current);
		};
	});

	return {
		get url() {
			return url;
		},
		get missing() {
			return missing;
		}
	};
}
