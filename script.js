// DOM Elements
const excelFileInput = document.getElementById('excel-file');
const namesBody = document.getElementById('names-body');
const randomizeBtn = document.getElementById('randomize-btn');
const exportBtn = document.getElementById('export-btn');
const timerToggleBtn = document.getElementById('timer-toggle-btn');
const timerModal = document.getElementById('timer-modal');
const closeTimerBtn = document.getElementById('close-timer');

// Timer DOM
const timeInputs = document.getElementById('time-inputs');
const inputMinutes = document.getElementById('input-minutes');
const inputSeconds = document.getElementById('input-seconds');
const timeDisplay = document.getElementById('time-display');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');
const modalRecordBtn = document.getElementById('modal-record-btn');

// State
let namesList = [];
let timerInterval = null;
let targetEndTime = 0;
let isRunning = false;
let currentMode = 'countdown'; // 'countdown' or 'stopwatch'
let accumulatedTime = 0; // For pausing
let initialDurationMs = 0;
let lastUpdate = 0;
let activeRecordIndex = 0; // Tracks which contestant's turn it is
let hasBeeped10s = false;
let hasBeeped0s = false;


// --- EXCEL PARSING & RANDOMIZATION ---

excelFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = e.target.result;
        // Parse the workbook
        const workbook = XLSX.read(data, { type: 'binary' });
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON array of arrays
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        namesList = [];

        if (rows.length > 0) {
            // Find the index of the column with header "name" (case-insensitive)
            const headerRow = rows[0];
            let nameColumnIndex = -1;

            for (let i = 0; i < headerRow.length; i++) {
                if (headerRow[i] !== undefined && String(headerRow[i]).trim().toLowerCase() === 'name') {
                    nameColumnIndex = i;
                    break;
                }
            }

            // If we found the "name" column, extract data from it
            if (nameColumnIndex !== -1) {
                // Skip the header row (index 0)
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row[nameColumnIndex] !== undefined && String(row[nameColumnIndex]).trim() !== '') {
                        namesList.push({ name: String(row[nameColumnIndex]).trim(), time: null });
                    }
                }
            } else {
                alert('No column with header "name" found in the Excel sheet.');
                // Reset file input so user can choose again seamlessly
                excelFileInput.value = '';
                return;
            }
        }

        // Randomize
        namesList = shuffleArray(namesList);

        // Reset state for new sheet
        activeRecordIndex = 0;
        resetTimer();

        // Render
        renderTable();

        // Enable randomize button
        randomizeBtn.disabled = false;
        // Enable export button
        exportBtn.disabled = false;
    };
    reader.readAsBinaryString(file);
});

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

randomizeBtn.addEventListener('click', () => {
    if (namesList.length > 0) {
        namesList = shuffleArray(namesList);
        renderTable();
        // Disable the randomize button after clicking once
        randomizeBtn.disabled = true;
    }
});

exportBtn.addEventListener('click', () => {
    if (namesList.length === 0) {
        alert("No data to export.");
        return;
    }

    const exportData = [["Name", "Time"]];
    
    namesList.forEach(contestant => {
        exportData.push([contestant.name, contestant.time ? contestant.time : "-"]);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recorded Times");
    
    // Trigger download
    XLSX.writeFile(wb, "Recorded_Times.xlsx");
});

function getNextActiveIndex() {
    return namesList.findIndex(c => c.time === null);
}

// Update the shared Record Logic
function recordTimeForIndex(idx, row, timeCell, btn) {
    let timeText = timeDisplay.innerText;
    if (timeDisplay.classList.contains('hidden')) {
        timeText = "00:00.00"; // not started yet
    }
    
    namesList[idx].time = timeText;
    timeCell.innerText = timeText;
    
    activeRecordIndex = getNextActiveIndex();

    resetTimer();
    // close window on table button click too, since we added the modal button
    timerModal.classList.add('hidden');
    document.body.classList.remove('no-scroll');

    btn.disabled = true;
    btn.innerText = 'Recorded';
    btn.classList.add('outline-btn');
    btn.classList.remove('primary-btn');
    
    row.style.backgroundColor = 'rgba(0, 86, 179, 0.1)';
    setTimeout(() => {
        row.style.backgroundColor = '';
    }, 500);
}

function renderTable() {
    namesBody.innerHTML = '';

    if (namesList.length === 0) {
        namesBody.innerHTML = `<tr class="empty-state"><td colspan="5">No names found in the file.</td></tr>`;
        return;
    }

    namesList.forEach((contestant, index) => {
        const tr = document.createElement('tr');
        const isRecorded = contestant.time !== null;

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${contestant.name}</strong></td>
            <td class="recorded-time-cell">${isRecorded ? contestant.time : '-'}</td>
            <td>
                <button class="btn ${isRecorded ? 'outline-btn' : 'primary-btn'} record-btn" data-index="${index}" disabled>
                    ${isRecorded ? 'Recorded' : 'Record Time'}
                </button>
            </td>
            <td>
                <div class="menu-container">
                    <button class="menu-toggle-btn" data-index="${index}">&#x22EE;</button>
                    <div class="menu-popup hidden" id="menu-${index}">
                        <button class="rerecord-name-btn" data-index="${index}">Re-record</button>
                        <button class="delete-name-btn" data-index="${index}">Delete</button>
                    </div>
                </div>
            </td>
        `;
        namesBody.appendChild(tr);
    });

    activeRecordIndex = getNextActiveIndex();

    // Attach listeners to record buttons
    const recordBtns = document.querySelectorAll('.record-btn');
    recordBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isRunning) {
                alert("Please pause/stop the timer before recording the time.");
                return;
            }

            const row = e.target.closest('tr');
            const timeCell = row.querySelector('.recorded-time-cell');
            const idx = parseInt(btn.getAttribute('data-index'));
            
            recordTimeForIndex(idx, row, timeCell, btn);
        });
    });

    // Attach listeners to menu toggles
    const menuToggles = document.querySelectorAll('.menu-toggle-btn');
    menuToggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.getAttribute('data-index');
            const popup = document.getElementById(`menu-${idx}`);
            // close others
            document.querySelectorAll('.menu-popup').forEach(p => {
                if (p !== popup) p.classList.add('hidden');
            });
            popup.classList.toggle('hidden');
        });
    });

    // Attach listeners to re-record buttons
    const rerecordBtns = document.querySelectorAll('.rerecord-name-btn');
    rerecordBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'));
            
            // Cannot re-record if someone is currently running the timer
            if (isRunning) {
                alert("Please pause/stop the timer before modifying rows.");
                return;
            }
            
            namesList[idx].time = null;
            renderTable();
            
            // If timer wasn't running, ensure the active button gets enabled visually
            const nextIdx = getNextActiveIndex();
            if (nextIdx !== -1) {
                const activeBtn = document.querySelector(`.record-btn[data-index="${nextIdx}"]`);
                if (activeBtn) activeBtn.disabled = false;
            }
        });
    });

    // Attach listeners to delete buttons
    const deleteBtns = document.querySelectorAll('.delete-name-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'));
            namesList.splice(idx, 1);
            
            // Re-render table completely
            renderTable();
            
            // If timer is running, the new active button must be re-enabled
            if (isRunning) {
                const nextIdx = getNextActiveIndex();
                if (nextIdx !== -1) {
                    const activeBtn = document.querySelector(`.record-btn[data-index="${nextIdx}"]`);
                    if (activeBtn) activeBtn.disabled = false;
                }
            }
        });
    });
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-container')) {
        document.querySelectorAll('.menu-popup').forEach(p => p.classList.add('hidden'));
    }
});


// --- MODAL TOGGLE & DRAG ---

timerToggleBtn.addEventListener('click', () => {
    timerModal.classList.toggle('hidden');
    if (timerModal.classList.contains('hidden')) {
        document.body.classList.remove('no-scroll');
    } else {
        document.body.classList.add('no-scroll');
    }
});

closeTimerBtn.addEventListener('click', () => {
    timerModal.classList.add('hidden');
    document.body.classList.remove('no-scroll');
});

// Drag functionality for the modal
const modalHeader = document.getElementById('modal-drag-handle');
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

modalHeader.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = timerModal.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    timerModal.style.transition = 'none'; // Disable transition during drag
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let x = e.clientX - dragOffsetX;
    let y = e.clientY - dragOffsetY;

    // Boundary checks (optional but good UX)
    x = Math.max(0, Math.min(x, window.innerWidth - timerModal.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - timerModal.offsetHeight));

    timerModal.style.left = `${x}px`;
    timerModal.style.top = `${y}px`;
    timerModal.style.right = 'auto'; // Disable flex/right positioning
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        timerModal.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
});


// --- AUDIO BEEP LOGIC ---

// Create audio elements from provided files
const beep10sAudio = new Audio('10_second_beep.mp3');
const buzzer0sAudio = new Audio('0_second_buzzer.mp3');

// --- TIMER / STOPWATCH LOGIC ---

function formatTime(ms, isOvertime = false) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10); // 2 digits 00-99

    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    const csStr = String(centiseconds).padStart(2, '0');

    let sign = isOvertime ? "+" : "";
    return `${sign}${mStr}:${sStr}.${csStr}`;
}

function updateDisplay() {
    const now = Date.now();
    let remaining = targetEndTime - now;

    if (remaining > 0) {
        // Countdown mode
        currentMode = 'countdown';
        timeDisplay.innerText = formatTime(remaining);
        timeDisplay.classList.remove('timer-danger');

        // 10 second beep (triggered at 12s, cut off after 2s)
        if (remaining <= 11000 && remaining > 10000 && !hasBeeped10s) {
            beep10sAudio.currentTime = 0; // reset just in case
            beep10sAudio.play().catch(e => console.error("Audio play failed:", e));

            // Stop after 2 seconds
            setTimeout(() => {
                beep10sAudio.pause();
            }, 2000);

            hasBeeped10s = true;
        }

        // 0 second buzzer (triggered early at 1s)
        if (remaining <= 1000 && remaining > 0 && !hasBeeped0s) {
            buzzer0sAudio.currentTime = 0;
            buzzer0sAudio.play().catch(e => console.error("Audio play failed:", e));
            hasBeeped0s = true;
        }

    } else {
        // Fallback if we somehow bypassed the 1s completely
        if (!hasBeeped0s) {
            buzzer0sAudio.currentTime = 0;
            buzzer0sAudio.play().catch(e => console.error("Audio play failed:", e));
            hasBeeped0s = true;
        }

        // Stopwatch mode (overtime)
        currentMode = 'stopwatch';
        const overtime = Math.abs(remaining);
        timeDisplay.innerText = formatTime(overtime, true);
        timeDisplay.classList.add('timer-danger');
    }
}

startBtn.addEventListener('click', () => {
    if (isRunning) return;

    // If starting from scratch (inputs visible)
    if (timeDisplay.classList.contains('hidden')) {
        const mins = parseInt(inputMinutes.value) || 0;
        const secs = parseInt(inputSeconds.value) || 0;
        initialDurationMs = (mins * 60 + secs) * 1000;

        targetEndTime = Date.now() + initialDurationMs;

        timeInputs.classList.add('hidden');
        timeDisplay.classList.remove('hidden');
    } else {
        // Resuming from pause
        targetEndTime = Date.now() + initialDurationMs;
    }

    isRunning = true;
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    // Enable the current active record button since timer is running
    const activeBtn = document.querySelector(`.record-btn[data-index="${activeRecordIndex}"]`);
    if (activeBtn) {
        activeBtn.disabled = false;
    }
    // and enable modal record btn
    if (activeRecordIndex !== -1) {
        modalRecordBtn.disabled = false;
    }

    timerInterval = setInterval(updateDisplay, 10); // 10ms update for smooth .ms
});

stopBtn.addEventListener('click', () => {
    if (!isRunning) return;

    // Pause logic
    clearInterval(timerInterval);
    isRunning = false;

    // Save remaining time for resume
    initialDurationMs = targetEndTime - Date.now();

    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
});

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    currentMode = 'countdown';
    initialDurationMs = 0;
    hasBeeped10s = false;
    hasBeeped0s = false;

    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');

    timeInputs.classList.remove('hidden');
    timeDisplay.classList.add('hidden');
    timeDisplay.classList.remove('timer-danger');

    inputMinutes.value = "0";
    inputSeconds.value = "0";
    timeDisplay.innerText = "00:00.00";

    // Disable the active record button while timer is reset (not started)
    const activeBtn = document.querySelector(`.record-btn[data-index="${activeRecordIndex}"]`);
    if (activeBtn) {
        activeBtn.disabled = true;
    }
    modalRecordBtn.disabled = true;
}

resetBtn.addEventListener('click', resetTimer);

// --- MODAL "RECORD & CLOSE" BUTTON LOGIC ---
modalRecordBtn.addEventListener('click', () => {
    if (isRunning) {
        alert("Please stop the timer before recording.");
        return;
    }
    if (activeRecordIndex === -1 || activeRecordIndex >= namesList.length) {
        alert("No remaining names to record.");
        return;
    }
    
    const timeText = timeDisplay.innerText;
    
    // Update data model
    namesList[activeRecordIndex].time = timeText;
    
    // Update visual table
    const tableBtn = document.querySelector(`.record-btn[data-index="${activeRecordIndex}"]`);
    if (tableBtn) {
        const row = tableBtn.closest('tr');
        const timeCell = row.querySelector('.recorded-time-cell');
        timeCell.innerText = timeText;
        
        tableBtn.disabled = true;
        tableBtn.innerText = 'Recorded';
        tableBtn.classList.add('outline-btn');
        tableBtn.classList.remove('primary-btn');
        
        row.style.backgroundColor = 'rgba(0, 86, 179, 0.1)';
        setTimeout(() => row.style.backgroundColor = '', 500);
    }
    
    activeRecordIndex = getNextActiveIndex();
    
    // Reset timer back to 0
    resetTimer();
    
    // Close window
    timerModal.classList.add('hidden');
    document.body.classList.remove('no-scroll');
});
