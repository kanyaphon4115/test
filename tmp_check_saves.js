const mysql = require('mysql2');
const db = mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'test' });

db.connect(err => {
  if (err) {
    console.error('DB CONNECT ERROR', err);
    process.exit(1);
  }
  db.query('SELECT * FROM saves LIMIT 20', (err, rows) => {
    if (err) {
      console.error('QUERY ERROR', err);
      process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.end();
  });
});
