import { describe, it, expect } from 'vitest';
import { SHORT_ID_LENGTH, buildShortIds, expandId } from './ids.js';

const payload = {
	notes: [
		{
			id: 'aaaaaaaa-1111-4111-8111-111111111111',
			title: 'N',
			folder: null,
			blocks: [
				{ id: 'bbbbbbbb-2222-4222-8222-222222222222', type: 'todo', content: 't1', depth: 0, createdBy: 'user', activity: [] },
				{ id: 'cccccccc-3333-4333-8333-333333333333', type: 'text', content: 'prosa', depth: 0 }
			]
		}
	]
};

describe('buildShortIds', () => {
	it('acorta a 8 chars notas y tareas (la prosa no necesita id corto)', () => {
		const map = buildShortIds(payload);
		expect(map.get('aaaaaaaa-1111-4111-8111-111111111111')).toBe('aaaaaaaa');
		expect(map.get('bbbbbbbb-2222-4222-8222-222222222222')).toBe('bbbbbbbb');
		expect(map.has('cccccccc-3333-4333-8333-333333333333')).toBe(false);
	});

	it('alarga ante colisión de prefijo', () => {
		const clash = {
			notes: [
				{
					id: 'n1',
					blocks: [
						{ id: 'aaaaaaaa-1111-4111-8111-111111111111', type: 'todo', content: 'a', depth: 0, createdBy: 'user', activity: [] },
						{ id: 'aaaaaaaa-9999-4999-8999-999999999999', type: 'todo', content: 'b', depth: 0, createdBy: 'user', activity: [] }
					]
				}
			]
		};
		const map = buildShortIds(clash);
		const shorts = [...map.values()].filter((s) => s.startsWith('aaaaaaaa'));
		expect(new Set(shorts).size).toBe(shorts.length);
		expect(shorts.every((s) => s.length > SHORT_ID_LENGTH)).toBe(true);
	});
});

describe('expandId', () => {
	it('expande un prefijo único a su UUID', () => {
		expect(expandId(payload, 'bbbbbbbb')).toEqual({ ok: true, id: 'bbbbbbbb-2222-4222-8222-222222222222' });
	});
	it('un UUID completo pasa tal cual', () => {
		expect(expandId(payload, 'aaaaaaaa-1111-4111-8111-111111111111')).toEqual({
			ok: true,
			id: 'aaaaaaaa-1111-4111-8111-111111111111'
		});
	});
	it('sin match → no-encontrado; múltiples → ambiguo', () => {
		expect(expandId(payload, 'zzzz')).toEqual({ ok: false, reason: 'no-encontrado' });
		const clash = {
			notes: [
				{
					id: 'n1',
					blocks: [
						{ id: 'dddddddd-1', type: 'todo', content: 'a', depth: 0, createdBy: 'user', activity: [] },
						{ id: 'dddddddd-2', type: 'todo', content: 'b', depth: 0, createdBy: 'user', activity: [] }
					]
				}
			]
		};
		expect(expandId(clash, 'dddddddd')).toEqual({ ok: false, reason: 'ambiguo' });
	});
});
