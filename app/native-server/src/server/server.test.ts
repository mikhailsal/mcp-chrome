import { describe, expect, test, afterAll, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import Server from './index';

describe('server tests', () => {
  // Start the server test instance.
  beforeAll(async () => {
    await Server.getInstance().ready();
  });

  // Stop the server.
  afterAll(async () => {
    await Server.stop();
  });

  test('GET /ping returns the expected response', async () => {
    const response = await supertest(Server.getInstance().server)
      .get('/ping')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      status: 'ok',
      message: 'pong',
    });
  });
});
