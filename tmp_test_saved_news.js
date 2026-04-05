const http = require('http');
const userId = 1;
const path = `/saved-news?user_id=${userId}&page=1&pageSize=10`;
const options = {
  hostname: 'localhost',
  port: 3000,
  path,
  method: 'GET',
};
const req = http.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('status', res.statusCode);
    console.log(body);
  });
});
req.on('error', err => console.error(err));
req.end();
