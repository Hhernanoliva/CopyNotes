// Los teclados virtuales suelen no disparar keydown 'Enter'; mandan un
// beforeinput. Traducimos su inputType a la intención del editor para
// entrar por la misma puerta que el Enter de escritorio.
export function intentFromBeforeInput(inputType) {
	if (inputType === 'insertParagraph') return 'enter';
	if (inputType === 'insertLineBreak') return 'softbreak';
	return null;
}
