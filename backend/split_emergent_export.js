const fs = require('fs');
const path = require('path');

const root = process.cwd();
const inputPath = path.join(root, 'bajaj-dyeing-unit-data.json');
const shadesOut = path.join(root, 'shades-import.json');
const tasksOut = path.join(root, 'daily-tasks-import.json');

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const payload = JSON.parse(raw);

const shades = Array.isArray(payload.shades) ? payload.shades : [];
const dailyTasks = Array.isArray(payload.daily_tasks)
  ? payload.daily_tasks
  : (Array.isArray(payload.tasks) ? payload.tasks : []);

const cleanedShades = shades
  .map((s) => ({
    shade_number: String(s.shade_number ?? '').trim(),
    original_weight: Number(s.original_weight ?? 0),
    program_number: s.program_number || 'P1',
    rc: s.rc || 'No',
    dyes: Array.isArray(s.dyes) ? s.dyes : [],
    created_at: s.created_at || null,
  }))
  .filter((s) => s.shade_number);

const cleanedTasks = dailyTasks
  .map((t) => ({
    date: String(t.date ?? '').trim(),
    m1: Array.isArray(t.m1) ? t.m1 : [],
    m2: Array.isArray(t.m2) ? t.m2 : [],
    m3: Array.isArray(t.m3) ? t.m3 : [],
    m4: Array.isArray(t.m4) ? t.m4 : [],
    m5: Array.isArray(t.m5) ? t.m5 : [],
    created_at: t.created_at || null,
  }))
  .filter((t) => t.date);

fs.writeFileSync(shadesOut, JSON.stringify(cleanedShades, null, 2));
fs.writeFileSync(tasksOut, JSON.stringify(cleanedTasks, null, 2));

console.log(`Created ${shadesOut} with ${cleanedShades.length} documents`);
console.log(`Created ${tasksOut} with ${cleanedTasks.length} documents`);
