import { describe, expect, it } from 'vitest';
import { moveInOrder } from '../src/app/model';

describe('drop slot reorder', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves ahead of or behind another assignment', () => {
    expect(moveInOrder(ids, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveInOrder(ids, 'a', 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveInOrder(ids, 'a', 4)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveInOrder(ids, 'c', 1)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('dropping next to itself changes nothing', () => {
    expect(moveInOrder(ids, 'b', 1)).toBeNull();
    expect(moveInOrder(ids, 'b', 2)).toBeNull();
    expect(moveInOrder(ids, 'x', 0)).toBeNull();
  });
});
