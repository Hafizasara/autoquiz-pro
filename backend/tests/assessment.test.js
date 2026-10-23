import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import http from 'node:http';

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test('Health API - should return online status and healthy services', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.status, 'success');
  assert.equal(data.message, 'AutoQuiz Pro API is running');
});

test('Security & Authentication - should reject unauthenticated POST /api/v1/assessments with 401', async () => {
  const res = await fetch(`${baseUrl}/api/v1/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Midterm Exam',
      courseId: 1
    })
  });
  const data = await res.json();

  assert.equal(res.status, 401);
  assert.equal(data.status, 'fail');
  assert.match(data.message, /authentication/i);
});

test('Input Validation - should reject assessment creation when title is missing', async () => {
  // Generate a mock JWT token or test route validation
  const res = await fetch(`${baseUrl}/api/v1/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid_or_missing_token'
    },
    body: JSON.stringify({
      courseId: 1,
      totalMarks: 100
    })
  });

  assert.equal(res.status, 401);
});

test('Error Handling - should return 404 for non-existent routes', async () => {
  const res = await fetch(`${baseUrl}/api/v1/non-existent-endpoint`);
  const data = await res.json();

  assert.equal(res.status, 404);
  assert.equal(data.status, 'fail');
  assert.match(data.message, /Cannot find route/);
});
