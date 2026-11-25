import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compare } from '../check-size.mjs';
import { measureFunctions } from './functions.mjs';

describe('compare', () => {
  const allow = { files: { 'a.ts': 600 }, functions: { 'a.ts::big': 120 } };

  it('passes sizes at or under the recorded size', () => {
    const result = compare({ files: { 'a.ts': 600 }, functions: { 'a.ts::big': 100 } }, allow);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.shrinkable, ['a.ts::big']);
  });

  it('rejects growth and new entries', () => {
    const result = compare(
      { files: { 'a.ts': 601, 'b.ts': 501 }, functions: { 'a.ts::big': 120 } },
      allow,
    );
    assert.equal(result.violations.length, 2);
    assert.match(result.violations[0], /a\.ts: 601 lines \(allowlisted at 600/);
    assert.match(result.violations[1], /b\.ts: 501 lines \(over the file limit, not allowlisted\)/);
  });

  it('marks entries that now fit as shrinkable', () => {
    assert.deepEqual(compare({ files: {}, functions: {} }, allow).shrinkable, [
      'a.ts',
      'a.ts::big',
    ]);
  });
});

describe('measureFunctions', () => {
  it('names functions by where they are declared', () => {
    const src = [
      'function outer() {',
      '  const inner = () => {',
      '    return 1;',
      '  };',
      '  list.map(() => 2);',
      '  list.map(() => 3);',
      '}',
      'class Box {',
      '  get size() {',
      '    return 1;',
      '  }',
      '}',
      '',
    ].join('\n');
    assert.deepEqual(measureFunctions('a.ts', src), [
      { name: 'outer', line: 1, lines: 7 },
      { name: 'outer.inner', line: 2, lines: 3 },
      { name: 'outer.map(callback)', line: 5, lines: 1 },
      { name: 'outer.map(callback)#2', line: 6, lines: 1 },
      { name: 'Box.size', line: 9, lines: 3 },
    ]);
  });

  it('reads Vue script blocks with their line numbers', () => {
    const vue =
      '<template><div/></template>\n<script setup lang="ts">\nconst go = () => {\n  x();\n};\n</script>\n';
    assert.deepEqual(measureFunctions('a.vue', vue), [{ name: 'go', line: 3, lines: 3 }]);
  });
});
