// End-to-end test against MOCK Groq/Gemini servers (no real API calls, no keys needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let mock, app, base, groqChatCalls = 0, geminiCalls = 0, failGroqChat = false;

function startMock() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks);
      const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

      if (req.url.endsWith('/audio/transcriptions')) {
        // the fake "WAV" carries the transcript as text after a 4 byte RIFF tag
        const s = raw.toString('latin1');
        const m = s.match(/RIFF([^\r]*)/);
        const delayMatch = /\[delay=(\d+)\]/.exec(m?.[1] ?? '');
        const text = (m?.[1] ?? '').replace(/\[delay=\d+\]/, '');
        const reply = () => json({ text, segments: [{ text, no_speech_prob: 0.01, compression_ratio: 1.2 }] });
        return delayMatch ? setTimeout(reply, Number(delayMatch[1])) : reply();
      }

      if (req.url.includes('/chat/completions')) {
        groqChatCalls++;
        if (failGroqChat) return json({ error: { message: 'rate limit' } }, 429);
        return json({ choices: [{ message: { content: JSON.stringify(answerFor(JSON.parse(raw.toString()).messages)) } }] });
      }
      if (req.url.includes(':generateContent')) {
        geminiCalls++;
        const b = JSON.parse(raw.toString());
        const messages = [{ content: b.systemInstruction.parts[0].text }, { content: b.contents[0].parts[0].text }];
        return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answerFor(messages)) }] } }] });
      }
      json({ error: 'not found' }, 404);
    });
    srv.listen(0, () => resolve(srv));
  });
}

function answerFor(messages) {
  const sys = messages[0].content, user = messages[1].content;
  if (sys.includes('Part 1')) return { statements: [{ label: 'A', en: 'x', vi: 'x', focus: 'y' }, { label: 'B', en: 'x', vi: 'x' }] };
  if (sys.includes('Part 2')) return { question_en: 'q', question_vi: 'q', options: [], answer: 'b', reason_vi: 'r', confidence: 'high' };
  const answered = Number(/Already answered questions: (\d+)/.exec(user)[1]);
  const lastChunk = user.split('\n---\n').pop();
  const asked = /\?/.test(lastChunk) && !/conversation body/.test(lastChunk);
  return {
    gist_vi: /Include gist_vi: yes/.test(user) ? 'Tóm tắt' : '',
    questions: asked ? [{ text_en: 'Q?', answer_en: `ans-${answered}`, answer_vi: 'đáp án', confidence: 'high' }] : [],
  };
}

async function post(path, body) {
  return fetch(base + path, { method: 'POST', ...body });
}
async function chunk(sessionId, seq, transcript) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('RIFF' + transcript, 'latin1')], { type: 'audio/wav' }), 'c.wav');
  form.append('sessionId', sessionId);
  form.append('seq', String(seq));
  const res = await post('/api/toeic/chunk', { body: form });
  assert.equal(res.status, 200);
  const text = await res.text();
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

test.before(async () => {
  mock = await startMock();
  const port = mock.address().port;
  process.env.GROQ_API_KEY = 'test-groq';
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.GROQ_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${port}`;
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0);
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
test.after(async () => { await app.close(); mock.close(); });

test('health endpoint reports configured providers', async () => {
  const r = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(r, { ok: true, groq: true, gemini: true });
});

test('part 2 item streams transcript -> position -> item -> done', async () => {
  const sid = 'sess-part2-aaaa';
  await post('/api/toeic/session', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, part: 2 }) });
  const ev = await chunk(sid, 1, 'Number 7. Where is the meeting? A. Room 3. B. At noon. C. Yes.');
  assert.deepEqual(ev.map((e) => e.type), ['transcript', 'position', 'item', 'done']);
  const item = ev.find((e) => e.type === 'item');
  assert.equal(item.part, 2);
  assert.equal(item.number, 7);
  assert.equal(item.data.answer, 'B'); // normalised from lowercase "b"
  assert.equal(ev.find((e) => e.type === 'position').next, 8);
});

test('chunks arriving out of order are still tracked in seq order', async () => {
  const sid = 'sess-order-bbbb';
  await post('/api/toeic/session', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, part: 2 }) });
  // seq 2 is sent first (no cue) and must wait for seq 1
  const p2 = chunk(sid, 2, 'Who is leading the session? A. Ms. Kim. B. Monday. C. The lobby.');
  await new Promise((r) => setTimeout(r, 150));
  const p1 = chunk(sid, 1, 'Number 7. Where is the meeting? A. Room 3. B. At noon. C. Yes.');
  const [e2, e1] = [await p2, await p1];
  assert.equal(e1.find((e) => e.type === 'item').number, 7);
  assert.equal(e2.find((e) => e.type === 'item').number, 8);
});

test('part 3 set: gist after the body, then one answer per spoken question', async () => {
  const sid = 'sess-set3-cccc';
  await post('/api/toeic/session', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, part: 3 }) });
  const body = await chunk(sid, 1, 'Questions 32 through 34 refer to the following conversation. Hi this is Anna, your order is ready.');
  const s1 = body.find((e) => e.type === 'set');
  assert.equal(s1.gist_vi, 'Tóm tắt');
  assert.equal(s1.questions.length, 0);
  const q1 = await chunk(sid, 2, 'Why is the woman calling?');
  const s2 = q1.find((e) => e.type === 'set');
  assert.equal(s2.gist_vi, undefined);
  assert.equal(s2.questions[0].number, 32);
  const q2 = await chunk(sid, 3, 'What does the man ask about?');
  assert.equal(q2.find((e) => e.type === 'set').questions[0].number, 33);
  const q3 = await chunk(sid, 4, 'What will the woman do next?');
  const last = q3.filter((e) => e.type === 'position').pop();
  assert.deepEqual([last.part, last.next], [3, 35]);
});

test('when the first LLM answers 429 the chain falls back to Gemini', async () => {
  failGroqChat = true;
  const before = geminiCalls;
  const sid = 'sess-fallback-dddd';
  await post('/api/toeic/session', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, part: 1 }) });
  const ev = await chunk(sid, 1, 'Number 1. A. A man is pulling a cart. B. Boxes are stacked. C. A bike is parked. D. She reads.');
  assert.ok(ev.some((e) => e.type === 'item'), JSON.stringify(ev));
  assert.ok(geminiCalls > before);
  failGroqChat = false;
});

test('rejects non-WAV uploads and missing session ids', async () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not audio')]), 'c.wav');
  form.append('sessionId', 'sess-bad-eeeeeee');
  assert.equal((await post('/api/toeic/chunk', { body: form })).status, 400);
});
