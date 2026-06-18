/**
 * Shared PDF generation utility for Bajaj Dyeing App.
 * Generates print-ready HTML that matches the grid UI exactly.
 */

const MACHINES = [
  { id: 'm1', name: 'M1', capacity: 10.5, totalSprings: 7 },
  { id: 'm2', name: 'M2', capacity: 12, totalSprings: 8 },
  { id: 'm3', name: 'M3', capacity: 12, totalSprings: 8 },
  { id: 'm4', name: 'M4', capacity: 6, totalSprings: 4 },
  { id: 'm5', name: 'M5', capacity: 24, totalSprings: 16 },
];

interface TaskForPdf {
  shade_number: string;
  springs_2ply: number;
  springs_3ply: number;
  status?: string;
  ply2_weight?: number;
  ply3_weight?: number;
}

interface DailyTaskForPdf {
  id?: string;
  date: string;
  m1?: TaskForPdf[];
  m2?: TaskForPdf[];
  m3?: TaskForPdf[];
  m4?: TaskForPdf[];
  m5?: TaskForPdf[];
}

const CSS_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: landscape; margin: 12mm; }
  body {
    font-family: 'Segoe UI', -apple-system, Arial, sans-serif;
    color: #1B2A4A;
    background: #fff;
    padding: 20px;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #2B6CB0;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .report-header h1 {
    font-size: 22px;
    color: #2B6CB0;
    letter-spacing: 1px;
  }
  .report-header .date-badge {
    background: #2B6CB0;
    color: #fff;
    padding: 6px 18px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 15px;
  }
  .report-header .subtitle {
    font-size: 12px;
    color: #5A6B8A;
    margin-top: 2px;
  }

  .task-section {
    margin-bottom: 28px;
    page-break-inside: avoid;
  }
  .task-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .task-section-header .section-date {
    font-size: 18px;
    font-weight: bold;
    color: #1B2A4A;
  }

  /* Grid - matches UI exactly */
  .grid-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 6px;
  }
  .grid-table th {
    background: #2B6CB0;
    color: #fff;
    padding: 10px 8px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
  }
  .grid-table th .machine-name {
    font-size: 16px;
    display: block;
    margin-bottom: 2px;
  }
  .grid-table th .machine-info {
    font-size: 10px;
    opacity: 0.8;
    font-weight: 500;
  }
  .grid-table th.row-num-header {
    width: 36px;
    background: transparent;
    color: #6B7A94;
    font-size: 12px;
  }

  .grid-table td {
    border: 1.5px solid #D0DAE8;
    border-radius: 10px;
    padding: 10px 8px;
    text-align: center;
    vertical-align: top;
    min-width: 145px;
    min-height: 90px;
    background: #fff;
    position: relative;
  }
  .grid-table td.row-num {
    border: none;
    min-width: 36px;
    width: 36px;
    font-weight: bold;
    color: #6B7A94;
    font-size: 13px;
    vertical-align: middle;
    text-align: center;
    background: transparent;
  }
  .grid-table td.filled {
    background: #e8f5e9;
  }
  .grid-table td.empty-cell {
    color: #B0BEC5;
    font-size: 14px;
    vertical-align: middle;
    background: #FAFCFF;
  }

  .cell-shade {
    font-size: 15px;
    font-weight: 700;
    color: #2B6CB0;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .cell-ply-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .cell-ply-item {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .cell-ply-label {
    font-size: 11px;
    color: #6B7A94;
  }
  .cell-ply-value {
    font-size: 13px;
    font-weight: 700;
    color: #1B2A4A;
  }
  .cell-total {
    font-size: 11px;
    font-weight: 700;
    color: #2B6CB0;
    text-align: right;
    margin-top: 4px;
  }

  /* Status badges for dyeing master */
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    margin-left: 6px;
    color: #fff;
  }
  .status-completed { background: #38A169; }
  .status-rejected { background: #E53E3E; }
  .status-in-progress { background: #3182CE; }
  .status-pending { background: #A0AEC0; }

  .cell-weight-row {
    font-size: 11px;
    color: #1B2A4A;
    margin-top: 4px;
  }

  .report-footer {
    margin-top: 20px;
    border-top: 2px solid #D0DAE8;
    padding-top: 12px;
    text-align: center;
    color: #6B7A94;
    font-size: 11px;
  }
`;

function buildGridHTML(
  taskData: DailyTaskForPdf,
  options: { showStatus?: boolean; showWeights?: boolean; onlyCompleted?: boolean } = {}
): string {
  const { showStatus = false, showWeights = false, onlyCompleted = false } = options;

  // Determine max rows
  let maxRows = 1;
  MACHINES.forEach(m => {
    let tasks = (taskData as any)[m.id] || [];
    if (onlyCompleted) {
      tasks = tasks.filter((t: any) => t.status === 'completed');
    }
    maxRows = Math.max(maxRows, tasks.length);
  });

  if (maxRows === 0) {
    return '<p style="color: #6B7A94; text-align: center; padding: 30px;">No completed tasks for this date.</p>';
  }

  // Machine headers
  let headerCells = '<th class="row-num-header">#</th>';
  MACHINES.forEach(m => {
    let tasks = (taskData as any)[m.id] || [];
    if (onlyCompleted) {
      tasks = tasks.filter((t: any) => t.status === 'completed');
    }
    const totalUsed = tasks.reduce((s: number, t: any) => s + (t.springs_2ply || 0) + (t.springs_3ply || 0), 0);
    headerCells += `
      <th>
        <span class="machine-name">${m.name}</span>
        <span class="machine-info">${m.capacity}kg &bull; ${totalUsed}/${m.totalSprings}</span>
      </th>`;
  });

  // Data rows
  let bodyRows = '';
  for (let r = 0; r < maxRows; r++) {
    bodyRows += `<tr><td class="row-num">${r + 1}</td>`;
    MACHINES.forEach(m => {
      let tasks = (taskData as any)[m.id] || [];
      if (onlyCompleted) {
        tasks = tasks.filter((t: any) => t.status === 'completed');
      }
      const task = tasks[r];

      if (task) {
        const total = (task.springs_2ply || 0) + (task.springs_3ply || 0);
        let statusHTML = '';
        if (showStatus && task.status) {
          const statusClass = `status-${task.status || 'pending'}`;
          const statusLabel = (task.status || 'pending').charAt(0).toUpperCase() + (task.status || 'pending').slice(1);
          statusHTML = `<span class="status-badge ${statusClass}">${statusLabel}</span>`;
        }
        let weightHTML = '';
        if (showWeights) {
          const w2 = parseFloat(task.ply2_weight || 0);
          const w3 = parseFloat(task.ply3_weight || 0);
          if (w2 > 0 || w3 > 0) {
            weightHTML = `<div class="cell-weight-row">Wt: ${(w2 + w3).toFixed(2)}kg</div>`;
          }
        }

        bodyRows += `
          <td class="filled">
            <div class="cell-shade">#${task.shade_number}${statusHTML}</div>
            <div class="cell-ply-row">
              <div class="cell-ply-item">
                <span class="cell-ply-label">2P</span>
                <span class="cell-ply-value">${task.springs_2ply || 0}</span>
              </div>
              <div class="cell-ply-item">
                <span class="cell-ply-label">3P</span>
                <span class="cell-ply-value">${task.springs_3ply || 0}</span>
              </div>
            </div>
            <div class="cell-total">Total: ${total}/${m.totalSprings}</div>
            ${weightHTML}
          </td>`;
      } else {
        bodyRows += '<td class="empty-cell">-</td>';
      }
    });
    bodyRows += '</tr>';
  }

  return `
    <table class="grid-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

/**
 * Generate & print a Daily Tasks PDF (for the admin daily-tasks page).
 */
export function printDailyTaskPdf(task: DailyTaskForPdf): void {
  const gridHTML = buildGridHTML(task);

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Daily Task - ${task.date}</title>
    <style>${CSS_STYLES}</style>
  </head><body>
    <div class="report-header">
      <div>
        <h1>BAJAJ DYEING UNIT</h1>
        <div class="subtitle">Daily Task Report</div>
      </div>
      <div class="date-badge">📅 ${task.date}</div>
    </div>
    ${gridHTML}
    <div class="report-footer">
      Generated: ${new Date().toLocaleString()} &bull; Bajaj Dyeing Unit
    </div>
  </body></html>`;

  openPrintWindow(html);
}

/**
 * Generate & print completed tasks PDF from Dyeing Master (only completed tasks).
 */
export function printCompletedTasksPdf(taskData: DailyTaskForPdf, date: string): void {
  const gridHTML = buildGridHTML(taskData, {
    showStatus: true,
    showWeights: true,
    onlyCompleted: true,
  });

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Completed Tasks - ${date}</title>
    <style>${CSS_STYLES}</style>
  </head><body>
    <div class="report-header">
      <div>
        <h1>BAJAJ DYEING UNIT</h1>
        <div class="subtitle">Daily Completed Tasks Report</div>
      </div>
      <div class="date-badge">📅 ${date}</div>
    </div>
    ${gridHTML}
    <div class="report-footer">
      Generated: ${new Date().toLocaleString()} &bull; Bajaj Dyeing Unit &bull; Completed Tasks Only
    </div>
  </body></html>`;

  openPrintWindow(html);
}

/**
 * Generate & print ALL tasks (with status) from Dyeing Master.
 */
export function printAllTasksPdf(taskData: DailyTaskForPdf, date: string): void {
  const gridHTML = buildGridHTML(taskData, {
    showStatus: true,
    showWeights: true,
    onlyCompleted: false,
  });

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>All Tasks - ${date}</title>
    <style>${CSS_STYLES}</style>
  </head><body>
    <div class="report-header">
      <div>
        <h1>BAJAJ DYEING UNIT</h1>
        <div class="subtitle">Daily Tasks Report — All Status</div>
      </div>
      <div class="date-badge">📅 ${date}</div>
    </div>
    ${gridHTML}
    <div class="report-footer">
      Generated: ${new Date().toLocaleString()} &bull; Bajaj Dyeing Unit
    </div>
  </body></html>`;

  openPrintWindow(html);
}

function openPrintWindow(html: string): void {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}
