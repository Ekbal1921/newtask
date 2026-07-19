// Mega Task BD - Premium Tasks Controller
import { db, doc, getDoc, getDocs, collection, query, where, orderBy } from "./firebase.js";
import { state, syncUserSession, showToast, initPullToRefresh, animateCounter } from "./app.js";

// DOM Elements
const skeleton = document.getElementById("task-skeleton");
const listContainer = document.getElementById("task-list-container");
const emptyState = document.getElementById("task-empty-state");
const coinCounter = document.getElementById("user-task-coins");
const adModal = document.getElementById("task-ad-modal");

// Cooldown tracker array
let cooldownIntervals = [];

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
    // Sync session and bind data
    syncUserSession(async () => {
        setupTelegramBackButton();
        animateCounter("user-task-coins", state.userDoc.coins, 800);
        await loadTasks();
    });

    // Pull to refresh support
    initPullToRefresh(async () => {
        await loadTasks();
        showToast("Tasks refreshed", "success");
    });
});

// Telegram Back Button Integration
function setupTelegramBackButton() {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            tg.BackButton.hide();
            window.location.href = "index.html";
        });
    }
}

// Load tasks from Firestore
async function loadTasks() {
    skeleton.style.display = "flex";
    listContainer.style.display = "none";
    emptyState.style.display = "none";
    
    // Clear existing interval countdowns
    cooldownIntervals.forEach(intervalId => clearInterval(intervalId));
    cooldownIntervals = [];

    const telegramId = String(state.tgUser.id);

    try {
        // Fetch active tasks
        const tasksQuery = query(collection(db, "tasks"), where("enabled", "==", true));
        const tasksSnap = await getDocs(tasksQuery);
        
        const tasks = [];
        tasksSnap.forEach(docSnap => {
            tasks.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (tasks.length === 0) {
            skeleton.style.display = "none";
            emptyState.style.display = "flex";
            return;
        }

        // Fetch completed task records for this user
        const completedQuery = collection(db, "users", telegramId, "completedTasks");
        const completedSnap = await getDocs(completedQuery);
        
        const completedMap = {};
        completedSnap.forEach(docSnap => {
            completedMap[docSnap.id] = docSnap.data();
        });

        // Render Tasks
        listContainer.innerHTML = "";
        tasks.forEach(task => {
            const card = createTaskCard(task, completedMap[task.id]);
            listContainer.appendChild(card);
        });

        skeleton.style.display = "none";
        listContainer.style.display = "flex";

    } catch (err) {
        console.error("Error loading tasks:", err);
        showToast("Failed to load tasks", "error");
    }
}

// Create Task Card element
function createTaskCard(task, completedRecord) {
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.flexDirection = "column";
    card.style.alignItems = "stretch";
    card.style.gap = "14px";
    
    const limit = Number(task.limit) || 0;
    const cooldown = Number(task.cooldown) || 0; // minutes
    const reward = Number(task.reward) || 10;
    
    let completedCount = 0;
    let lastCompletedAt = null;
    
    if (completedRecord) {
        completedCount = completedRecord.count || 0;
        lastCompletedAt = completedRecord.lastCompletedAt ? completedRecord.lastCompletedAt.toDate() : null;
    }

    // Check completion limits
    const isLimitReached = limit > 0 && completedCount >= limit;
    
    // Check cooldown state
    let onCooldown = false;
    let cooldownSecondsLeft = 0;
    if (lastCompletedAt && cooldown > 0) {
        const diffMs = Date.now() - lastCompletedAt.getTime();
        const diffMins = diffMs / 60000;
        if (diffMins < cooldown) {
            onCooldown = true;
            cooldownSecondsLeft = Math.ceil((cooldown * 60) - (diffMs / 1000));
        }
    }

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="card-badge-icon">
                    <i class="fa-solid fa-bolt-lightning"></i>
                </div>
                <div>
                    <h4 class="card-title">${escapeHtml(task.title)}</h4>
                    <span class="card-desc">${escapeHtml(task.description)}</span>
                </div>
            </div>
            <div class="balance-symbol" style="box-shadow:none;">+${reward} Coins</div>
        </div>
        
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; border-top:1px solid rgba(255,255,255,0.03); padding-top:10px;">
            <span style="font-size:12px; color:var(--text-secondary);">
                Limit: <strong>${completedCount}/${limit > 0 ? limit : '∞'}</strong>
            </span>
            <div id="btn-container-${task.id}" style="min-width: 120px; display:flex; justify-content:flex-end;">
                <!-- Filled dynamically below -->
            </div>
        </div>
    `;

    const btnContainer = card.querySelector(`#btn-container-${task.id}`);
    
    if (isLimitReached) {
        btnContainer.innerHTML = `<span class="badge badge-rejected" style="padding:6px 12px;"><i class="fa-solid fa-lock"></i> Limit Reached</span>`;
    } else if (onCooldown) {
        btnContainer.innerHTML = `<span class="badge badge-pending" id="cooldown-badge-${task.id}" style="padding:6px 12px;"><i class="fa-solid fa-clock"></i> Cooldown</span>`;
        startCooldownTimer(task.id, cooldownSecondsLeft, btnContainer, task);
    } else {
        const startBtn = document.createElement("button");
        startBtn.className = "btn-premium";
        startBtn.style.padding = "8px 16px";
        startBtn.style.fontSize = "13px";
        startBtn.style.width = "auto";
        startBtn.innerHTML = `Start Task <i class="fa-solid fa-play" style="font-size:10px;"></i>`;
        startBtn.addEventListener("click", () => triggerTaskFlow(task));
        btnContainer.appendChild(startBtn);
    }

    return card;
}

// Cooldown live timer handler
function startCooldownTimer(taskId, durationSeconds, container, task) {
    let timeLeft = durationSeconds;
    
    const updateDisplay = () => {
        const badge = container.querySelector(`#cooldown-badge-${taskId}`);
        if (!badge) return;
        
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        badge.innerHTML = `<i class="fa-solid fa-clock"></i> ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    updateDisplay();

    const intervalId = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(intervalId);
            // Replace with active start button
            container.innerHTML = "";
            const startBtn = document.createElement("button");
            startBtn.className = "btn-premium";
            startBtn.style.padding = "8px 16px";
            startBtn.style.fontSize = "13px";
            startBtn.style.width = "auto";
            startBtn.innerHTML = `Start Task <i class="fa-solid fa-play" style="font-size:10px;"></i>`;
            startBtn.addEventListener("click", () => triggerTaskFlow(task));
            container.appendChild(startBtn);
        } else {
            updateDisplay();
        }
    }, 1000);

    cooldownIntervals.push(intervalId);
}

// Task execution flow
let activeTaskTimer = null;
async function triggerTaskFlow(task) {
    // Validate VPN access
    if (!state.isVpnValid) {
        showToast("VPN required to complete tasks!", "error");
        return;
    }

    // Initialize UI phases in modal
    const adPhase = document.getElementById("modal-ad-phase");
    const workPhase = document.getElementById("modal-work-phase");
    const zoneIdText = document.getElementById("modal-zone-id");
    const timerCircle = document.getElementById("task-timer-circle");
    const timerText = document.getElementById("task-timer-text");
    const countdownVal = document.getElementById("modal-countdown-val");
    const claimBtn = document.getElementById("btn-claim-task");

    adPhase.style.display = "block";
    workPhase.style.display = "none";
    zoneIdText.textContent = task.adZoneId || "Default Interstitial";
    timerCircle.style.strokeDashoffset = "0";
    claimBtn.disabled = true;
    claimBtn.textContent = "Claim Reward";
    
    adModal.classList.add("active");
    
    // Phase 1: Show Interstitial Ad countdown (5 seconds simulation)
    let adTimeLeft = 5;
    timerText.textContent = adTimeLeft;
    const totalDash = 251.2;
    
    clearInterval(activeTaskTimer);
    activeTaskTimer = setInterval(() => {
        adTimeLeft--;
        timerText.textContent = adTimeLeft;
        
        // Animate circular ring
        const offset = totalDash - (totalDash * (5 - adTimeLeft) / 5);
        timerCircle.style.strokeDashoffset = offset;
        
        if (adTimeLeft <= 0) {
            clearInterval(activeTaskTimer);
            // Move to Phase 2
            startTaskWorkPhase(task);
        }
    }, 1000);
}

// Phase 2: Start task target browsing and work timer
function startTaskWorkPhase(task) {
    const adPhase = document.getElementById("modal-ad-phase");
    const workPhase = document.getElementById("modal-work-phase");
    const timerCircle = document.getElementById("task-timer-circle");
    const timerText = document.getElementById("task-timer-text");
    const countdownVal = document.getElementById("modal-countdown-val");
    const claimBtn = document.getElementById("btn-claim-task");

    adPhase.style.display = "none";
    workPhase.style.display = "block";

    // Redirect to destination link in new window/tab
    window.open(task.targetUrl, "_blank");

    // Task duration timer (default 20 seconds)
    const duration = 20; 
    let taskTimeLeft = duration;
    
    timerCircle.style.strokeDashoffset = "0";
    timerText.textContent = taskTimeLeft;
    countdownVal.textContent = taskTimeLeft;

    const totalDash = 251.2;

    activeTaskTimer = setInterval(() => {
        taskTimeLeft--;
        timerText.textContent = taskTimeLeft;
        countdownVal.textContent = taskTimeLeft;

        // Animate circular ring
        const offset = totalDash - (totalDash * (duration - taskTimeLeft) / duration);
        timerCircle.style.strokeDashoffset = offset;

        if (taskTimeLeft <= 0) {
            clearInterval(activeTaskTimer);
            claimBtn.disabled = false;
            claimBtn.textContent = `Claim ${task.reward} Coins`;
            
            // Set claim callback
            claimBtn.onclick = () => claimTaskReward(task);
        }
    }, 1000);
}

// Securely claim task rewards
async function claimTaskReward(task) {
    const claimBtn = document.getElementById("btn-claim-task");
    claimBtn.disabled = true;
    claimBtn.textContent = "Verifying...";

    const telegramId = String(state.tgUser.id);
    const userRef = doc(db, "users", telegramId);
    const completedTaskRef = doc(db, "users", telegramId, "completedTasks", task.id);

    try {
        const { runTransaction, serverTimestamp, increment } = await import("./js/firebase.js");
        
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw "User profile not found";

            const completedSnap = await transaction.get(completedTaskRef);
            
            let currentCount = 0;
            let lastCompletedAt = null;
            if (completedSnap.exists()) {
                currentCount = completedSnap.data().count || 0;
                lastCompletedAt = completedSnap.data().lastCompletedAt ? completedSnap.data().lastCompletedAt.toDate() : null;
            }

            // Check if limits exceeded
            const limit = Number(task.limit) || 0;
            if (limit > 0 && currentCount >= limit) {
                throw "Task limit reached. Reward denied.";
            }

            // Check cooldown in database
            const cooldown = Number(task.cooldown) || 0;
            if (lastCompletedAt && cooldown > 0) {
                const diffMins = (Date.now() - lastCompletedAt.getTime()) / 60000;
                if (diffMins < cooldown) {
                    throw "Task is still on cooldown. Reward denied.";
                }
            }

            // Perform atomic coin increase
            transaction.update(userRef, {
                coins: increment(task.reward)
            });

            // Log or update the completed task document
            transaction.set(completedTaskRef, {
                taskId: task.id,
                count: increment(1),
                lastCompletedAt: serverTimestamp()
            }, { merge: true });

            // Create ledger history
            const historyRef = doc(collection(db, "history"));
            transaction.set(historyRef, {
                telegramId: telegramId,
                type: "task",
                referenceId: task.id,
                coins: task.reward,
                description: `Completed task: ${task.title}`,
                createdAt: serverTimestamp()
            });
        });

        showToast(`Task rewarded: +${task.reward} coins!`, "success");
        adModal.classList.remove("active");
        
        // Update local coins state and animate counter
        state.userDoc.coins += task.reward;
        animateCounter("user-task-coins", state.userDoc.coins, 800);
        
        // Reload tasks list to bind new cooldowns/limits
        await loadTasks();

    } catch (err) {
        console.error("Reward claim failed:", err);
        showToast(typeof err === "string" ? err : "Verification failed", "error");
        adModal.classList.remove("active");
    }
}

// Helper: Escape HTML strings to prevent XSS
function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
