import { describe, expect, it } from 'vitest';
import { isRedoRequested } from './redo';

const note = (actor) => ({ actor, action: 'note' });

describe('isRedoRequested', () => {
	it('true when unchecked and last activity is a user instruction', () => {
		expect(isRedoRequested({ checked: false }, [{ action: 'done', actor: 'agent' }, note('user')])).toBe(true);
	});
	it('false when the task is checked (done, leave alone)', () => {
		expect(isRedoRequested({ checked: true }, [note('user')])).toBe(false);
	});
	it('false when there is no activity', () => {
		expect(isRedoRequested({ checked: false }, [])).toBe(false);
	});
	it('false when the last entry is not a user note', () => {
		expect(isRedoRequested({ checked: false }, [{ action: 'reopened', actor: 'user' }])).toBe(false);
	});
	it('false when the last note is by an agent, not the user', () => {
		expect(isRedoRequested({ checked: false }, [{ action: 'note', actor: 'agent' }])).toBe(false);
	});
});
