const { responseFormatter } = await import('./backend/middleware/responseFormatter.js');

const res = {
  statusCode: 200,
  locals: {},
  json: function(body) { console.log(JSON.stringify(body, null, 2)); return this; }
};

responseFormatter(null, res, () => {});

res.json({ success: true, data: [1, 2, 3], count: 3 });
res.json({ success: true, data: [1, 2, 3] });
res.json({ success: true, data: { a: 1 }, extra: true });

