const test = require('node:test');
const assert = require('node:assert/strict');
const { Tracker, partOf, directionsPart } = require('../dist/toeic/tracker');

const items = (r) => r.jobs.filter((j) => j.kind === 'item');

test('part boundaries follow the official structure', () => {
  assert.deepEqual([1, 6, 7, 31, 32, 70, 71, 100].map(partOf), [1, 1, 2, 2, 3, 3, 4, 4]);
});

test('part 1: cue then cue-less chunks advance the counter', () => {
  const t = new Tracker();
  const a = items(t.ingest('Number 1. A. The man is pulling a cart. B. The woman is reading. C. They are seated. D. A bike is parked.'));
  assert.equal(a.length, 1);
  assert.equal(a[0].number, 1);
  assert.equal(a[0].part, 1);
  const b = items(t.ingest('A. Some boxes are stacked. B. He is opening a door. C. A truck is parked. D. Lights are on.'));
  assert.equal(b[0].number, 2);
});

test('part 2: two items merged in one chunk are split by "Number N" cues', () => {
  const t = new Tracker();
  t.reposition(2);
  const r = items(
    t.ingest(
      'Number 7. Mark your answer on your answer sheet. Where is the meeting? A. In room 3. B. At noon. C. Yes, I did. ' +
        'Number 8. Mark your answer on your answer sheet. When does the store open? A. At nine. B. Near the bank. C. Two tickets.',
    ),
  );
  assert.deepEqual(r.map((j) => j.number), [7, 8]);
  assert.ok(!/answer sheet/i.test(r[0].text));
  assert.equal(t.nextQ, 9);
});

test('a lone "Number 9." waits for the content of the next chunk', () => {
  const t = new Tracker();
  t.reposition(2, 9);
  assert.equal(t.ingest('Number 9.').jobs.length, 0);
  const r = items(t.ingest('Who is leading the training session? A. Ms. Kim. B. Next Monday. C. In the lobby.'));
  assert.equal(r[0].number, 9);
});

test('directions of part 3 move the position and produce no job', () => {
  const t = new Tracker();
  t.reposition(2, 31);
  const text =
    'Directions: You will hear some conversations between two or more people. You will be asked to answer three questions about what the speakers say in each conversation. Select the best response to each question and mark the letter on your answer sheet.';
  assert.equal(directionsPart(text), 3);
  const r = t.ingest(text);
  assert.equal(r.jobs.length, 0);
  assert.equal(t.part, 3);
  assert.equal(t.nextQ, 32);
});

test('part 3 set: intro+body, questions, closing and next set without intro', () => {
  const t = new Tracker();
  t.reposition(3);
  const r1 = t.ingest('Questions 32 through 34 refer to the following conversation. Hi, this is Anna from the print shop. Your order is ready.');
  assert.equal(r1.jobs.length, 1);
  const set = r1.jobs[0].set;
  assert.equal(set.first, 32);
  assert.equal(set.last, 34);
  assert.equal(set.kind, 'conversation');
  assert.ok(!/Questions 32/.test(set.chunks[0]));
  t.ingest('Why is the woman calling?');
  assert.equal(set.chunks.length, 2);
  assert.deepEqual(t.position(), { part: 3, next: 32 });
  t.markAnswered(set, 1);
  assert.deepEqual(t.position(), { part: 3, next: 33 });
  t.markAnswered(set, 2);
  assert.equal(t.set, null);
  assert.equal(t.nextQ, 35);
  const r2 = t.ingest('Good morning, can I help you find something? I am looking for a gift.');
  assert.equal(r2.jobs[0].set.first, 35);
});

test('a new intro replaces an unfinished set; part 4 talks are recognised', () => {
  const t = new Tracker();
  t.reposition(3, 68);
  t.ingest('Questions 68 through 70 refer to the following conversation. Hello there my friend how are you.');
  const r = t.ingest('Questions 71 through 73 refer to the following telephone message. Hi, this is Dr. Lee calling about your appointment.');
  const set = r.jobs[0].set;
  assert.equal(set.part, 4);
  assert.equal(set.kind, 'talk');
  assert.equal(t.part, 4);
});

test('general instructions and noise are ignored', () => {
  const t = new Tracker();
  const long =
    'This is the TOEIC listening test. In the listening test you will be asked to demonstrate how well you understand spoken English. The entire listening test will last approximately forty five minutes. There are four parts and directions are given for each part.';
  assert.equal(t.ingest(long).jobs.length, 0);
  assert.equal(t.ingest('Thank you.').jobs.length, 0);
});

test('reposition by question number picks the right part', () => {
  const t = new Tracker();
  t.reposition(undefined, 45);
  assert.equal(t.part, 3);
  assert.equal(t.position().next, 45);
});
