import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEmojiTest,
  parseKeySet,
  parseSequenceProperties,
  parseCldrAnnotations,
  classifySequence,
  normKey,
  toCodePoints,
  stripTones,
  toneModifiers,
} from '../build/parse.mjs';

test('parseEmojiTest reads code points, status, group, subgroup and E-version', () => {
  const rows = parseEmojiTest(`
# group: Smileys & Emotion

# subgroup: face-smiling
1F600                                      ; fully-qualified     # 😀 E1.0 grinning face
1F636 200D 1F32B FE0F                      ; fully-qualified     # 😶‍🌫️ E13.1 face in clouds
1F636 200D 1F32B                           ; minimally-qualified # 😶‍🌫 E13.1 face in clouds
`);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].codePoints, [0x1f600]);
  assert.equal(rows[0].status, 'fully-qualified');
  assert.equal(rows[0].name, 'grinning face');
  assert.equal(rows[0].declaredVersion, '1.0');
  assert.equal(rows[0].group, 'Smileys & Emotion');
  assert.equal(rows[0].subgroup, 'face-smiling');
  assert.equal(rows[1].declaredVersion, '13.1');
  assert.equal(rows[2].status, 'minimally-qualified');
});

test('parseEmojiTest tolerates the Emoji 4.0 format with no E-version', () => {
  const rows = parseEmojiTest('1F600 ; fully-qualified # 😀 grinning face');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].declaredVersion, null);
  assert.equal(rows[0].name, 'grinning face');
});

test('normKey strips FE0F so qualified and unqualified forms unify', () => {
  assert.equal(normKey([0x2764, 0xfe0f]), '2764');
  assert.equal(normKey([0x2764]), '2764');
  assert.equal(normKey([0x1f468, 0x200d, 0x1f469]), '1F468-200D-1F469');
});

test('parseKeySet expands ranges and keeps sequences', () => {
  const keys = parseKeySet(`
231A..231B    ; Basic_Emoji    # watches
0023 20E3     ; Emoji_Keycap_Sequence
`);
  assert.ok(keys.has('231A'));
  assert.ok(keys.has('231B'));
  assert.ok(keys.has('0023-20E3'));
  assert.equal(keys.size, 3);
});

test('parseSequenceProperties maps keys to their property name', () => {
  const props = parseSequenceProperties('1F1E6 1F1E8 ; RGI_Emoji_Flag_Sequence ; flag: Ascension Island');
  assert.equal(props.get('1F1E6-1F1E8'), 'RGI_Emoji_Flag_Sequence');
});

test('parseCldrAnnotations collects keywords and the tts short name', () => {
  const map = parseCldrAnnotations(`
<annotation cp="😀">face | grin | grinning face</annotation>
<annotation cp="😀" type="tts">grinning face</annotation>
<annotation cp="&#x1F914;">thinking</annotation>
`);
  const grin = map.get(normKey(toCodePoints('😀')));
  assert.deepEqual(grin.keywords, ['face', 'grin', 'grinning face']);
  assert.equal(grin.tts, 'grinning face');
  // numeric character references must decode
  assert.ok(map.get(normKey(toCodePoints('🤔'))));
});

test('classifySequence distinguishes every structural kind', () => {
  assert.equal(classifySequence(toCodePoints('😀')), 'single');
  assert.equal(classifySequence(toCodePoints('🇦🇺')), 'flag');
  assert.equal(classifySequence(toCodePoints('1️⃣')), 'keycap');
  assert.equal(classifySequence(toCodePoints('🧑‍🚀')), 'zwj');
  assert.equal(classifySequence(toCodePoints('👍🏽')), 'modifier');
  assert.equal(classifySequence(toCodePoints('🏴󠁧󠁢󠁳󠁣󠁴󠁿')), 'tag-flag');
});

test('tone helpers find and remove skin-tone modifiers', () => {
  const cps = toCodePoints('👍🏽');
  assert.deepEqual(toneModifiers(cps), [0x1f3fd]);
  assert.deepEqual(stripTones(cps), [0x1f44d]);
  assert.deepEqual(toneModifiers(toCodePoints('👍')), []);
});
