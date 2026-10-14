const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database path
const dbPath = path.join(__dirname, 'routine.db');

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

      // Insert default routine if not exists
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

    // Export db for use in routes
    global.db = db;
    resolve(db);
  });
}

// API Routes

// Get all data
app.get('/api/routine', (req, res) => {
  const db = global.db;
  db.all('SELECT * FROM routines', [], (err, routines) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    db.all('SELECT * FROM tasks ORDER BY day, time', [], (err, tasks) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
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
      
      // Group tasks by day
      const days = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
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
      
      days.forEach(day => {
        result.days[day] = taskMap[day] || [];
      });
      
      res.json(result);
    });
  });
});

// Update wake/sleep times
app.put('/api/routine', (req, res) => {
  const { wake, sleep } = req.body;
  const db = global.db;
  
  db.run(
    'UPDATE routines SET wake_time = ?, sleep_time = ?',
    [wake, sleep],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ wake, sleep });
    }
  );
});

// Add task
app.post('/api/tasks', (req, res) => {
  const { day, time, desc } = req.body;
  const db = global.db;
  
  db.run(
    'INSERT INTO tasks (routine_id, day, time, desc) VALUES (1, ?, ?, ?)',
    [day, time, desc],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: this.lastID, day, time, desc });
    }
  );
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const db = global.db;
  
  db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ deleted: this.changes > 0 });
  });
});

// Edit task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { time, desc } = req.body;
  const db = global.db;
  
  db.run(
    'UPDATE tasks SET time = ?, desc = ? WHERE id = ?',
    [time, desc, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ updated: this.changes > 0 });
    }
  );
});

// Clear all data
app.delete('/api/routine', (req, res) => {
  const db = global.db;
  
  db.serialize(() => {
    db.run('DELETE FROM tasks', [], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      db.run('DELETE FROM routines WHERE id = 1', [], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ cleared: true });
      });
    });
  });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle SPA - serve index.html for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Erro ao inicializar banco de dados:', err);
    process.exit(1);
  });