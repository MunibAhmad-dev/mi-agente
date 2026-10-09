'use strict';

jest.mock('~/server/middleware', () => ({ requireJwtAuth: (req, res, next) => next() }), { virtual: true });
jest.mock('@librechat/data-schemas', () => ({ SystemCapabilities: { ACCESS_ADMIN: 'ACCESS_ADMIN' }, logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }), { virtual: true });
jest.mock('~/server/middleware/roles/capabilities', () => ({ requireCapability: () => (req, res, next) => next() }), { virtual: true });

const request = require('supertest');
const express = require('express');
const webhooksRouter = require('../webhooks');

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhooksRouter);

describe('Webhooks API routes', () => {
  let webhookId;

  test('GET /api/webhooks/events returns available events', async () => {
    const res = await request(app).get('/api/webhooks/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  test('POST /api/webhooks creates a webhook', async () => {
    const res = await request(app).post('/api/webhooks').send({
      url: 'https://example.com/hook',
      events: ['message.sent'],
      description: 'Test hook',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^wh_/);
    expect(res.body.url).toBe('https://example.com/hook');
    webhookId = res.body.id;
  });

  test('GET /api/webhooks lists created webhooks', async () => {
    const res = await request(app).get('/api/webhooks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.webhooks)).toBe(true);
  });

  test('GET /api/webhooks/:id returns the webhook', async () => {
    const res = await request(app).get(`/api/webhooks/${webhookId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(webhookId);
  });

  test('PUT /api/webhooks/:id updates description', async () => {
    const res = await request(app).put(`/api/webhooks/${webhookId}`).send({ description: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated');
  });

  test('PATCH /api/webhooks/:id/toggle deactivates webhook', async () => {
    const res = await request(app).patch(`/api/webhooks/${webhookId}/toggle`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('GET /api/webhooks/:id/stats returns stats', async () => {
    const res = await request(app).get(`/api/webhooks/${webhookId}/stats`);
    expect(res.status).toBe(200);
    expect(typeof res.body.totalDeliveries).toBe('number');
  });

  test('GET /api/webhooks/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/webhooks/wh_nonexistent');
    expect(res.status).toBe(404);
  });

  test('POST /api/webhooks with invalid URL returns 400', async () => {
    const res = await request(app).post('/api/webhooks').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  test('DELETE /api/webhooks/:id removes the webhook', async () => {
    const res = await request(app).delete(`/api/webhooks/${webhookId}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});
