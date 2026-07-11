import { describe, expect, it } from 'vitest';
import { treeToNode, serializeForest, deserializeForest } from './serialize';

function tree(block, children = []) {
	return { block, children };
}

describe('treeToNode', () => {
	it('flattens a copy tree into an id-free node with children', () => {
		const t = tree({ id: 'a', type: 'bullet', content: 'padre', checked: false, note: 'nota' }, [
			tree({ id: 'b', type: 'todo', content: 'hijo', checked: true })
		]);
		expect(treeToNode(t)).toEqual({
			type: 'bullet',
			content: 'padre',
			checked: false,
			note: 'nota',
			children: [{ type: 'todo', content: 'hijo', checked: true, note: '', children: [] }]
		});
	});
});

describe('serialize/deserialize forest', () => {
	it('round-trips a forest, unicode included', () => {
		const forest = [
			{ type: 'code', content: 'const x = "café ☕";\nreturn x', checked: false, note: '', children: [] },
			{ type: 'todo', content: 'hacer algo', checked: true, note: '', children: [] }
		];
		expect(deserializeForest(serializeForest(forest))).toEqual(forest);
	});

	it('returns null for an empty or invalid payload', () => {
		expect(deserializeForest('')).toBeNull();
		expect(deserializeForest(undefined)).toBeNull();
		expect(deserializeForest('not json')).toBeNull();
		expect(deserializeForest('[]')).toBeNull();
	});
});
