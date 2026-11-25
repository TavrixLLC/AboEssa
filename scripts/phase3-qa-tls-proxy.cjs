// TLS-only loopback facade for the isolated QA API. No public bind or arbitrary
// upstream/production URL, certificate bypass, or dotenv fallback.
if (process.env.REZONA_IMAGE_QA !== '1') throw new Error('Isolated QA flag required');
const https = require('node:https');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const key = readFileSync('D:/rezona-phase3-validation-20261117/tls-20261119/qa.key');
const cert = readFileSync('D:/rezona-phase3-validation-20261117/tls-20261119/qa.crt');
const server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: 58443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:58443' },
      timeout: 15000,
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('QA upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":"QA upstream unavailable"}');
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(58445, '127.0.0.1', () => console.log('PHASE3_QA_TLS_READY https://127.0.0.1:58445'));
process.once('SIGINT', () => server.close(() => process.exit(0)));
process.once('SIGTERM', () => server.close(() => process.exit(0)));
