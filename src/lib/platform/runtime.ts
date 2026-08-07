// Runtime identity stays in one place so components never inspect Tauri
// globals independently. Tauri 2 exposes __TAURI_INTERNALS__ in its webview.

export function getRuntimeKind() {
	if (
		typeof window !== 'undefined' &&
		('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
	) {
		return 'tauri';
	}
	return 'web';
}

export function isTauriRuntime() {
	return getRuntimeKind() === 'tauri';
}

export function getBackupSource() {
	return isTauriRuntime() ? 'desktop' : 'pwa';
}

// Abrir una dirección de afuera. En el navegador alcanza con window.open; en la
// app de escritorio NO abre nada y no avisa, porque el webview de Tauri descarta
// el pedido de ventana nueva salvo que la app registre un manejador. Ahí se pide
// por el comando de Rust, que lo manda al navegador del sistema.
//
// window.open se llama antes de cualquier await a propósito: si se posterga, el
// navegador ya no lo ve como parte del clic y lo bloquea como ventana emergente.
export async function openExternal(url) {
	if (!isTauriRuntime()) {
		window.open(url, '_blank', 'noopener,noreferrer');
		return;
	}
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('open_external', { url });
}
