import { describe, expect, it } from 'vitest';
import { buildTagsByTarget } from './dataset';

describe('buildTagsByTarget', () => {
	it('groups assignments into "type:id" -> tagId[] keys', () => {
		const assignments = [
			{ tagId: 't1', targetType: 'note', targetId: 'n1' },
			{ tagId: 't2', targetType: 'note', targetId: 'n1' },
			{ tagId: 't1', targetType: 'block', targetId: 'b1' }
		];
		expect(buildTagsByTarget(assignments)).toEqual({
			'note:n1': ['t1', 't2'],
			'block:b1': ['t1']
		});
	});

	it('returns an empty map for no assignments', () => {
		expect(buildTagsByTarget([])).toEqual({});
	});
});
