const express = require("express");
const mysql = require("mysql2");
const nodemailer = require("nodemailer"); 
const transporter = nodemailer.createTransport({ 
service: "gmail", 
auth: { user: "kanyaporn4115k@gmail.com", pass: "cdesqiwukctitcuo", 
},
pool: true,
maxConnections: 5,
connectionTimeout: 20000,
greetingTimeout: 20000,
socketTimeout: 20000,
 });
const cors = require("cors");
const bcrypt = require("bcrypt"); // ✅ ใส่ตรงนี้
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const OTP_EXPIRE_MS = 5 * 60 * 1000;
const normalizeOtp = (value) => String(value ?? "").trim();
const isOtpExpired = (otpExpire) => {
  const expireTime = new Date(otpExpire).getTime();
  return Number.isNaN(expireTime) || expireTime <= Date.now();
};
// 🔥 เชื่อม MySQL (แก้ตามของคุณ)
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "test"
});

// 🔥 เพิ่มอันนี้
db.connect((err) => {
  if (err) {
    console.log("❌ DB ERROR:", err);
  } else {
    console.log("✅ MySQL Connected");

    db.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      avatar VARCHAR(255)
    )`, (err) => { if (err) console.log(err); });

    db.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255)", (err) => {
      if (err && err.code !== "ER_DUP_FIELDNAME") {
        console.log(err);
      }
    });

    db.query("ALTER TABLE users ADD COLUMN otp_code VARCHAR(255)", (err) => {
      if (err && err.code !== "ER_DUP_FIELDNAME") {
        console.log(err);
      }
    });

    db.query("ALTER TABLE users ADD COLUMN otp_expire DATETIME", (err) => {
      if (err && err.code !== "ER_DUP_FIELDNAME") {
        console.log(err);
      }
    });

    db.query(`CREATE TABLE IF NOT EXISTS news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255),
      content TEXT,
      image VARCHAR(255),
      created_at DATETIME
    )`, (err) => { if (err) console.log(err); });

    db.query(`CREATE TABLE IF NOT EXISTS likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      news_id INT,
      UNIQUE KEY unique_like (user_id, news_id)
    )`, (err) => { if (err) console.log(err); });

    db.query(`CREATE TABLE IF NOT EXISTS saves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      news_id INT,
      UNIQUE KEY unique_save (user_id, news_id)
    )`, (err) => { if (err) console.log(err); });

    db.query(`CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      news_id INT,
      reason TEXT,
      created_at DATETIME
    )`, (err) => { if (err) console.log(err); });

    db.query(`CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      news_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME
    )`, (err) => { if (err) console.log(err); });

    db.query("ALTER TABLE comments ADD COLUMN content TEXT", (err) => {
      if (err && err.code !== "ER_DUP_FIELDNAME") {
        console.log(err);
      }
    });

  }
});
// ทดสอบ API
app.get("/", (req, res) => {
  res.send("API ทำงานแล้ว 🚀");
});
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).send("กรอกข้อมูลให้ครบ");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword],
      (err, result) => {
        if (err) {
          console.log(err);
          return res.status(500).send("สมัครไม่สำเร็จ");
        }
        res.send("สมัครสำเร็จ 🎉");
      }
    );
  } catch (error) {
    res.status(500).send(error);
  }
});
// 👇 ใส่ login ตรงนี้
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, result) => {
      if (err) return res.status(500).send(err);

      if (result.length === 0) {
        return res.status(400).send("ไม่พบ user");
      }

      const user = result[0];

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).send("รหัสผ่านผิด");
      }

      res.json({
        message: "Login สำเร็จ ✅",
        userId: user.id,
        name: user.name,
        email: user.email
      });
    }
  );
});

// ดึงข้อมูลจาก DB
app.get("/users", (req, res) => {
  db.query("SELECT * FROM users", (err, result) => {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});
// 📰 ดึงข่าวทั้งหมด พร้อม Pagination
app.get("/news", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
  const offset = (page - 1) * pageSize;

  db.query("SELECT COUNT(*) AS total FROM news", (err, countResult) => {
    if (err) {
      console.log(err);
      return res.status(500).send("ไม่สามารถดึงจำนวนข่าวได้");
    }

    const total = countResult[0].total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    db.query(
      `SELECT news.*, users.name, COUNT(likes.id) AS likes
       FROM news
       LEFT JOIN users ON news.user_id = users.id
       LEFT JOIN likes ON news.id = likes.news_id
       GROUP BY news.id
       ORDER BY news.id DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
      (err, result) => {
        if (err) {
          console.log(err);
          return res.status(500).send("ไม่สามารถดึงข่าวได้");
        }
        res.json({
          data: result,
          page,
          pageSize,
          totalPages
        });
      }
    );
  });
});

const avatarUploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(avatarUploadsDir)) {
  fs.mkdirSync(avatarUploadsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage: avatarStorage });

const newsUploadsDir = path.join(__dirname, "assets", "images");
if (!fs.existsSync(newsUploadsDir)) {
  fs.mkdirSync(newsUploadsDir, { recursive: true });
}

const newsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, newsUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const newsUpload = multer({ storage: newsStorage });

app.post("/post-news", newsUpload.single("image"), (req, res) => {
  // ❗ ห้าม destructure ก่อน multer
  const { user_id, title, content } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!user_id || !title || !content) {
    return res.status(400).send("กรอกข้อมูลให้ครบ");
  }

  db.query(
    "INSERT INTO news (user_id, title, content, image, created_at) VALUES (?, ?, ?, ?, NOW())",
    [user_id, title, content, image],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("โพสต์ข่าวไม่สำเร็จ");
      }
      res.send("โพสต์ข่าวสำเร็จ");
    }
  );
});

app.get("/news/:id", (req, res) => {
  const newsId = req.params.id;
  db.query(
    `SELECT news.*, users.name AS author, COUNT(likes.id) AS likes
     FROM news
     LEFT JOIN users ON news.user_id = users.id
     LEFT JOIN likes ON news.id = likes.news_id
     WHERE news.id = ?
     GROUP BY news.id`,
    [newsId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดึงข่าวได้");
      }
      if (result.length === 0) {
        return res.status(404).send("ไม่พบข่าว");
      }
      res.json(result[0]);
    }
  );
});

const listComments = (req, res) => {
  const newsId = Number(req.query.news_id);

  if (!newsId) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    `SELECT comments.id, comments.news_id, comments.user_id,
            comments.content,
            comments.created_at, users.name
     FROM comments
     LEFT JOIN users ON comments.user_id = users.id
     WHERE comments.news_id = ?
     ORDER BY comments.created_at ASC, comments.id ASC`,
    [newsId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดึงคอมเมนต์ได้");
      }
      res.json(result);
    }
  );
};

app.get("/comments", listComments);
app.get("/comment", listComments);

const createComment = (req, res) => {
  const { user_id, news_id, content } = req.body;
  const cleanComment = String(content ?? "").trim();

  if (!user_id || !news_id || !cleanComment) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    "INSERT INTO comments (user_id, news_id, content, created_at) VALUES (?, ?, ?, NOW())",
    [user_id, news_id, cleanComment],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถคอมเมนต์ได้");
      }

      db.query(
        `SELECT comments.id, comments.news_id, comments.user_id,
                comments.content,
                comments.created_at, users.name
         FROM comments
         LEFT JOIN users ON comments.user_id = users.id
         WHERE comments.id = ?`,
        [result.insertId],
        (selectErr, commentResult) => {
          if (selectErr || commentResult.length === 0) {
            if (selectErr) {
              console.log(selectErr);
            }
            return res.status(201).json({ id: result.insertId, user_id, news_id, content: cleanComment });
          }
          res.status(201).json(commentResult[0]);
        }
      );
    }
  );
};

app.post("/comment", createComment);
app.post("/comments", createComment);

app.post("/update-news", newsUpload.single("image"), (req, res) => {
const { id, user_id, title, content } = req.body;
  if (!id || !user_id || !title || !content) {
    return res.status(400).send("กรอกข้อมูลให้ครบ");
  }

  db.query("SELECT user_id FROM news WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send("เกิดข้อผิดพลาด");
    }

    if (result.length === 0) {
      return res.status(404).send("ไม่พบข่าว");
    }

    if (result[0].user_id !== Number(user_id)) {
      return res.status(403).send("ไม่มีสิทธิ์แก้ไขข่าวนี้");
    }

    if (req.file) {
      const imageUrl = req.file.filename;
      db.query(
        "UPDATE news SET title=?, content=?, image=? WHERE id=?",
        [title, content, imageUrl, id],
        (err) => {
          if (err) {
            console.log(err);
            return res.status(500).send("อัปเดตข่าวไม่สำเร็จ");
          }
          res.send("อัปเดตข่าวสำเร็จ");
        }
      );
    } else {
      db.query(
        "UPDATE news SET title=?, content=? WHERE id=?",
        [title, content, id],
        (err) => {
          if (err) {
            console.log(err);
            return res.status(500).send("อัปเดตข่าวไม่สำเร็จ");
          }
          res.send("อัปเดตข่าวสำเร็จ");
        }
      );
    }
  });
});

app.post("/delete-news", (req, res) => {
const { news_id, user_id } = req.body;
  if (!news_id || !user_id) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query("SELECT user_id FROM news WHERE id = ?", [news_id], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send("เกิดข้อผิดพลาด");
    }

    if (result.length === 0) {
      return res.status(404).send("ไม่พบข่าว");
    }

    if (result[0].user_id !== Number(user_id)) {
      return res.status(403).send("ไม่มีสิทธิ์ลบข่าวนี้");
    }

    db.query("DELETE FROM likes WHERE news_id = ?", [news_id], (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถลบข่าวได้");
      }

      db.query("DELETE FROM saves WHERE news_id = ?", [news_id], (err) => {
        if (err) {
          console.log(err);
          return res.status(500).send("ไม่สามารถลบข่าวได้");
        }

        db.query("DELETE FROM comments WHERE news_id = ?", [news_id], (err) => {
          if (err) {
            console.log(err);
            return res.status(500).send("ไม่สามารถลบข่าวได้");
          }

          db.query("DELETE FROM news WHERE id = ?", [news_id], (err) => {
            if (err) {
              console.log(err);
              return res.status(500).send("ไม่สามารถลบข่าวได้");
            }
            res.send("ลบข่าวสำเร็จ");
          });
        });
      });
    });
  });
});

app.post("/like", (req, res) => {
const { user_id, news_id } = req.body;
  if (!user_id || !news_id) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    "SELECT id FROM likes WHERE user_id = ? AND news_id = ?",
    [user_id, news_id],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดำเนินการได้");
      }

      const isLiked = result.length > 0;
      const actionQuery = isLiked
        ? "DELETE FROM likes WHERE user_id = ? AND news_id = ?"
        : "INSERT INTO likes (user_id, news_id) VALUES (?, ?)";

      db.query(actionQuery, [user_id, news_id], (err) => {
        if (err) {
          console.log(err);
          return res.status(500).send("ไม่สามารถดำเนินการได้");
        }

        db.query(
          "SELECT COUNT(*) AS total FROM likes WHERE news_id = ?",
          [news_id],
          (err, countResult) => {
            if (err) {
              return res.status(500).send(err);
            }

            res.json({
              likes: countResult[0].total,
              liked: !isLiked
            });
          }
        );
      });
    }
  );
});

app.post("/save", (req, res) => {
  const user_id = parseInt(req.body.user_id || req.headers.user_id, 10);
  const news_id = parseInt(req.body.news_id || req.headers.news_id, 10);

  if (!user_id || !news_id) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    "INSERT IGNORE INTO saves (user_id, news_id) VALUES (?, ?)",
    [user_id, news_id],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถบันทึกได้");
      }
      res.json({ success: true, message: "บันทึกข่าวสำเร็จ" });
    }
  );
});
app.post("/report", (req, res) => {
  const { user_id, news_id, reason } = req.body;

  if (!user_id || !news_id || !reason) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    "INSERT INTO reports (user_id, news_id, reason, created_at) VALUES (?, ?, ?, NOW())",
    [user_id, news_id, reason],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถรายงานได้");
      }
      res.send("รายงานเรียบร้อย");
    }
  );
});

app.get("/liked-news", (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).send("user_id หาย");

  db.query(
    `SELECT n.* FROM news n
     JOIN likes l ON n.id = l.news_id
     WHERE l.user_id = ?
     ORDER BY n.id DESC`,
    [userId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดึงข่าวถูกใจได้");
      }
      res.json(result);
    }
  );
});

app.get("/saved-news", (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).send("user_id หาย");

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
  const offset = (page - 1) * pageSize;

  db.query(
    "SELECT COUNT(*) AS total FROM saves WHERE user_id = ?",
    [userId],
    (err, countResult) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดึงจำนวนข่าวที่บันทึกได้");
      }

      const total = countResult[0].total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      db.query(
        `SELECT n.* FROM news n
         JOIN saves s ON n.id = s.news_id
         WHERE s.user_id = ?
         ORDER BY n.id DESC
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset],
        (err, result) => {
          if (err) {
            console.log(err);
            return res.status(500).send("ไม่สามารถดึงข่าวที่บันทึกได้");
          }
          res.json({
            data: result,
            page,
            pageSize,
            totalPages
          });
        }
      );
    }
  );
});

app.get("/profile", (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).send("user_id หาย");

  db.query(
    "SELECT id, name, email, avatar FROM users WHERE id = ?",
    [userId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ไม่สามารถดึงโปรไฟล์ได้");
      }
      if (result.length === 0) {
        return res.status(404).send("ไม่พบผู้ใช้");
      }
      res.json(result[0]);
    }
  );
});

app.put("/update-profile", (req, res) => {
  const { user_id, name, email, avatar } = req.body;

  if (!user_id || !name || !email) {
    return res.status(400).send("ข้อมูลไม่ครบ");
  }

  db.query(
    "UPDATE users SET name=?, email=?, avatar=? WHERE id=?",
    [name, email, avatar || null, user_id],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("อัปเดตไม่สำเร็จ");
      }
      res.send("อัปเดตโปรไฟล์สำเร็จ ✅");
    }
  );
});

app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("ไม่พบไฟล์");
  }

  const imageUrl = "http://localhost:3000/uploads/" + req.file.filename;
  res.json({ url: imageUrl });
});
app.delete("/delete-account", (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).send("ข้อมูลไม่ครบ");

  db.query("DELETE FROM likes WHERE user_id = ?", [user_id], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("ลบบัญชีไม่สำเร็จ");
    }

    db.query("DELETE FROM saves WHERE user_id = ?", [user_id], (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("ลบบัญชีไม่สำเร็จ");
      }

      db.query("DELETE FROM comments WHERE user_id = ?", [user_id], (err) => {
        if (err) {
          console.log(err);
          return res.status(500).send("ลบบัญชีไม่สำเร็จ");
        }

        db.query(
          "DELETE FROM comments WHERE news_id IN (SELECT id FROM news WHERE user_id = ?)",
          [user_id],
          (newsCommentsErr) => {
            if (newsCommentsErr) {
              console.log(newsCommentsErr);
              return res.status(500).send("ลบบัญชีไม่สำเร็จ");
            }

            db.query("DELETE FROM news WHERE user_id = ?", [user_id], (err) => {
              if (err) {
                console.log(err);
                return res.status(500).send("ลบบัญชีไม่สำเร็จ");
              }

              db.query("DELETE FROM users WHERE id = ?", [user_id], (err) => {
                if (err) {
                  console.log(err);
                  return res.status(500).send("ลบบัญชีไม่สำเร็จ");
                }
                res.send("ลบบัญชีสำเร็จ ✅");
              });
            });
          }
        );
      });
    });
  });
});
// เพิ่มข้อมูล
app.post("/add", (req, res) => {
  const { name, email } = req.body;

  db.query(
    "INSERT INTO users (name, email) VALUES (?, ?)",
    [name, email],
    (err, result) => {
      if (err) {
        res.send(err);
      } else {
        res.send("เพิ่มข้อมูลสำเร็จ");
      }
    }
  );
});
app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send("ระบบมีปัญหา กรุณาลองใหม่");
    }

    if (result.length === 0) {
      return res.send("ถ้ามี email นี้ จะส่ง OTP");
    }

    const user = result[0];

    // กันกดซ้ำ
    if (user.otp_code && user.otp_expire && !isOtpExpired(user.otp_expire)) {
      console.log("⛔ ใช้ OTP เดิม");
      return res.send("OTP ถูกส่งไปแล้ว");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expire = new Date(Date.now() + OTP_EXPIRE_MS);

    console.log("📩 OTP:", otp);

    db.query(
      "UPDATE users SET otp_code=?, otp_expire=? WHERE email=?",
      [otp, expire, email],
      (updateErr) => {
        if (updateErr) {
          console.log(updateErr);
          return res.status(500).send("ระบบมีปัญหา กรุณาลองใหม่");
        }

        let isFinished = false;
        const rollbackAndRespondError = (statusCode, message) =>
          db.query(
            "UPDATE users SET otp_code=NULL, otp_expire=NULL WHERE email=?",
            [email],
            () => res.status(statusCode).send(message)
          );

        const timeoutId = setTimeout(() => {
          if (isFinished) return;
          isFinished = true;
          rollbackAndRespondError(504, "ส่ง OTP ช้าเกิน 20 วินาที กรุณาลองใหม่");
        }, 20000);

        transporter.sendMail(
          {
            from: "kanyaporn4115k@gmail.com",
            to: email,
            subject: "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน",
            text: `OTP ของคุณคือ ${otp} (หมดอายุใน 5 นาที)`,
            html: `<p>OTP ของคุณคือ <b>${otp}</b></p><p>รหัสนี้หมดอายุใน 5 นาที</p>`
          },
          (mailErr) => {
            if (isFinished) return;
            isFinished = true;
            clearTimeout(timeoutId);

            if (mailErr) {
              console.log("❌ SEND MAIL ERROR:", mailErr);
              return rollbackAndRespondError(500, "ส่งอีเมล OTP ไม่สำเร็จ");
            }

            res.send("ส่ง OTP แล้ว");
          }
        );
      }
    );
  });
});
app.post("/reset-password", (req, res) => {
  const { email, otp, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send("ระบบมีปัญหา กรุณาลองใหม่");
    }

    if (result.length === 0) {
      return res.send("ไม่พบผู้ใช้");
    }

    const user = result[0];

    if (!user.otp_code) {
      return res.send("OTP หมดอายุ");
    }

    if (isOtpExpired(user.otp_expire)) {
      return db.query(
        "UPDATE users SET otp_code=NULL, otp_expire=NULL WHERE email=?",
        [email],
        () => res.send("OTP หมดอายุ")
      );
    }

    const cleanOtp = normalizeOtp(otp);
    const otpInDb = normalizeOtp(user.otp_code);

    console.log("OTP user:", cleanOtp);
    console.log("OTP DB:", otpInDb);

    // ✅ เทียบตรง ๆ
    if (!/^\d{6}$/.test(cleanOtp) || cleanOtp !== otpInDb) {
      return res.send("OTP ไม่ถูกต้อง");
    }

    // 🔐 password ยังต้อง hash นะ!
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "UPDATE users SET password=?, otp_code=NULL, otp_expire=NULL WHERE email=?",
      [hashedPassword, email],
      () => {
        res.send("เปลี่ยนรหัสสำเร็จ 🎉");
      }
    );
  });
});
app.listen(3000, () => {
  console.log("Server รันที่ http://localhost:3000");
});
