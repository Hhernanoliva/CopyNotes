// With the storage safety net every write bumps the agent signal, so a typing
// burst fires many bumps in a row. This trailing debounce folds them into ONE
// export.json write, `delay` ms after the burst goes quiet. The last schedule
// always ends in a write (unless cancelled on unmount — bounded by the
// mount-time export of the next launch).
export function createExportScheduler(write, delay = 500) {
	let timer = null;
	return {
		schedule() {
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				write();
			}, delay);
		},
		cancel() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
		}
	};
}
