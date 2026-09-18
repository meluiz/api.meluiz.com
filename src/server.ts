import { Hono } from 'hono';

const hono = new Hono();

hono.get('/', (ctx) => {
  return ctx.json({ foo: 'bar' });
});

export default hono;
