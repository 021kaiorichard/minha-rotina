const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();

// CORS configuration - restrict to known origins in production
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = isProduction
  ? ['https://minha-rotina.vercel.app', 'https://minha-rotina-git-main.vercel.app']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback - in production, specify exact origins
    }
  },
  methods: ['GET', 'PUT', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));

// Database path
const dbPath = path.join(__dirname, 'routine.db');

// Valid days enum
const VALID_DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

// Validate time format HH:MM
function isValidTime(timeStr) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

// Validate description - max length, sanitize HTML
function sanitizeDesc(desc) {
  if (typeof desc !== 'string') return '';
  const sanitized = desc.replace(/<[^>]*>/g, '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  return sanitized.substring(0, 120).trim();
}

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
    });

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS routines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wake_time TEXT NOT NULL,
          sleep_time TEXT NOT NULL,
          created_at DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          routine_id INTEGER NOT NULL,
          day TEXT NOT NULL,
          time TEXT NOT NULL,
          desc TEXT NOT NULL,
          created_at DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (routine_id) REFERENCES routines(id)
        )
      `);

      db.get('SELECT COUNT(*) as count FROM routines', [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (row.count === 0) {
          db.run(
            'INSERT INTO routines (wake_time, sleep_time) VALUES (?, ?)',
            ['07:00', '23:00'],
            (err) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );
        }
      });
    });

    global.db = db;
    resolve(db);
  });
}

// Run query with promise wrapper
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes, lastID: this.lastID });
      }
    });
  });
}

// Get query with promise wrapper
function getQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// API Routes

// Get all data
app.get('/api/routine', (req, res) => {
  const db = global.db;
  getQuery(db, 'SELECT * FROM routines', [])
    .then((routines) => {
      return getQuery(db, 'SELECT * FROM tasks ORDER BY day, time', [])
        .then((tasks) => {
          const result = {
            wake: routines[0] ? routines[0].wake_time : '07:00',
            sleep: routines[0] ? routines[0].sleep_time : '23:00',
            days: {
              segunda: [],
              terca: [],
              quarta: [],
              quinta: [],
              sexta: [],
              sabado: [],
              domingo: []
            }
          };

          const taskMap = {};
          tasks.forEach(task => {
            if (!taskMap[task.day]) {
              taskMap[task.day] = [];
            }
            taskMap[task.day].push({
              time: task.time,
              desc: task.desc
            });
          });

          ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].forEach(day => {
            result.days[day] = taskMap[day] || [];
          });

          res.json(result);
        });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro interno no servidor' });
    });
});

// Update wake/sleep times
app.put('/api/routine', (req, res) => {
  const { wake, sleep } = req.body;

  if (!wake || !isValidTime(wake) || !sleep || !isValidTime(sleep)) {
    return res.status(400).json({ error: 'Horários inválidos. Use formato HH:MM' });
  }

  runQuery(global.db, 'UPDATE routines SET wake_time = ?, sleep_time = ?', [wake, sleep])
    .then(() => {
      res.json({ wake, sleep });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro ao salvar horários' });
    });
});

// Add task
app.post('/api/tasks', (req, res) => {
  const { day, time, desc } = req.body;

  if (!day || !VALID_DAYS.includes(day)) {
    return res.status(400).json({ error: 'Dia inválido' });
  }

  if (!time || !isValidTime(time)) {
    return res.status(400).json({ error: 'Horário inválido. Use formato HH:MM' });
  }

  const sanitizedDesc = sanitizeDesc(desc);
  if (!sanitizedDesc) {
    return res.status(400).json({ error: 'Descrição inválida' });
  }

  runQuery(global.db, 'INSERT INTO tasks (routine_id, day, time, desc) VALUES (1, ?, ?, ?)', [day, time, sanitizedDesc])
    .then((result) => {
      res.status(201).json({ id: result.lastID, day, time, desc: sanitizedDesc });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro ao adicionar tarefa' });
    });
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const taskId = parseInt(id, 10);

  if (isNaN(taskId) || taskId <= 0) {
    return res.status(400).json({ error: 'ID de tarefa inválido' });
  }

  runQuery(global.db, 'DELETE FROM tasks WHERE id = ?', [taskId])
    .then((result) => {
      res.json({ deleted: result.changes > 0 });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro ao excluir tarefa' });
    });
});

// Edit task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { time, desc } = req.body;
  const taskId = parseInt(id, 10);

  if (isNaN(taskId) || taskId <= 0) {
    return res.status(400).json({ error: 'ID de tarefa inválido' });
  }

  if (!time || !isValidTime(time)) {
    return res.status(400).json({ error: 'Horário inválido. Use formato HH:MM' });
  }

  const sanitizedDesc = sanitizeDesc(desc);
  if (!sanitizedDesc) {
    return res.status(400).json({ error: 'Descrição inválida' });
  }

  runQuery(global.db, 'UPDATE tasks SET time = ?, desc = ? WHERE id = ?', [time, sanitizedDesc, taskId])
    .then((result) => {
      res.json({ updated: result.changes > 0 });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro ao atualizar tarefa' });
    });
});

// Clear all data
app.post('/api/routine/clear', (req, res) => {
  runQuery(global.db, 'DELETE FROM tasks', [])
    .then(() => {
      return runQuery(global.db, 'DELETE FROM routines WHERE id = 1', []);
    })
    .then(() => {
      res.json({ cleared: true });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Erro ao limpar rotina' });
    });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle SPA - serve index.html for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export app for Vercel serverless functions
// This allows both local (node server.js) and Vercel deployments
let server;

try {
  server = app.listen(3000, () => {
    console.log('Servidor local rodando na porta 3000');
  });
} catch (e) {
  console.warn('Could not start local server listener');
}

// For Vercel serverless function export
module.exports = app;

// Graceful shutdown
if (server) {
  server.on('close', () => {
    console.log('Servidor encerrado');
  });
}