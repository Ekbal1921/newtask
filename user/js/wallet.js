// Mega Task BD - Wallet Controller
import { db, doc, collection, query, where, orderBy, onSnapshot, writeBatch, increment, serverTimestamp } from "./firebase.js";
import { state, syncUserSession, showToast, initPullToRefresh, animateCounter } from "./app.js";

// DOM Elements
const walletCoins = document.getElementById("user-wallet-coins");
const conversionRateText = document.getElementById("wallet-conversion-rate");
const methodSelect = document.getElementById("withdraw-method");
const amountInput = document.getElementById("withdraw-amount");
const numberInput = document.getElementById("withdraw-number");
const rulesText = document.getElementById("withdraw-rules");
const submitBtn = document.getElementById("btn-submit-payout");
const historyRows = document.getElementById("history-rows");
const withdrawForm = document.getElementById("withdraw-form");

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
    syncUserSession(async () => {
        setupTelegramBackButton();
        bindWalletSettings();
        animateCounter("user-wallet-coins", state.userDoc.coins, 800);
        bindRealtimeWithdrawalHistory();
    });

    // Pull to Refresh support
    initPullToRefresh(async () => {
        // Re-sync session
        syncUserSession(() => {
            bindWalletSettings();
            animateCounter("user-wallet-coins", state.userDoc.coins, 500);
            showToast("Wallet data updated", "success");
        });
    });

    // Form Submit Handler
    withdrawForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmitPayout();
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

// Bind Configuration settings
function bindWalletSettings() {
    if (!state.settings) return;

    // Conversion rate
    conversionRateText.innerHTML = `<i class="fa-solid fa-circle-info"></i> Coin conversion rate: <strong>${state.settings.coinConversion || "1000 Coins = 10 BDT"}</strong> (Min: ${state.settings.minWithdraw || 1000} Coins)`;
    
    // Dynamic rules display
    rulesText.innerHTML = state.settings.referralRules || `
        1. Minimum withdrawal request is ${state.settings.minWithdraw || 1000} coins.<br>
        2. Enter your personal Bkash/Nagad/Rocket mobile wallet number.<br>
        3. Payment requests are processed within 24 hours.<br>
        4. Coin manipulation or cheating will lead to account termination.
    `;

    // Render Payment Methods
    methodSelect.innerHTML = `<option value="" disabled selected>Choose payment gateway</option>`;
    const methods = state.settings.paymentMethods || ["Bkash", "Nagad", "Rocket"];
    methods.forEach(method => {
        const opt = document.createElement("option");
        opt.value = method;
        opt.textContent = method;
        methodSelect.appendChild(opt);
    });
}

// Submit Payout Request
async function handleSubmitPayout() {
    const method = methodSelect.value;
    const number = numberInput.value.trim();
    const amount = parseInt(amountInput.value);

    // Frontend Validations
    if (!method) {
        showToast("Please select a payment method", "warning");
        return;
    }
    if (!number || number.length < 10) {
        showToast("Please enter a valid mobile number", "warning");
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid coin amount", "warning");
        return;
    }
    
    const minWithdraw = state.settings?.minWithdraw || 1000;
    if (amount < minWithdraw) {
        showToast(`Minimum withdrawal is ${minWithdraw} coins`, "warning");
        return;
    }

    if (amount > state.userDoc.coins) {
        showToast("Insufficient coin balance!", "error");
        return;
    }

    // Process Withdrawal (Atomic Batch Write)
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Processing... <i class="fa-solid fa-spinner fa-spin"></i>`;

    const telegramId = String(state.tgUser.id);
    const batch = writeBatch(db);

    // Create withdraw request document
    const withdrawRef = doc(collection(db, "withdraws"));
    const withdrawId = withdrawRef.id;

    const withdrawDoc = {
        id: withdrawId,
        telegramId: telegramId,
        username: state.tgUser.username || "",
        fullname: state.userDoc.fullname || "User",
        method: method,
        number: number,
        amount: amount,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    batch.set(withdrawRef, withdrawDoc);

    // Decrement user's coin balance
    const userRef = doc(db, "users", telegramId);
    batch.update(userRef, {
        coins: increment(-amount)
    });

    // Create transaction log
    const historyRef = doc(collection(db, "history"));
    batch.set(historyRef, {
        telegramId: telegramId,
        type: "withdraw",
        referenceId: withdrawId,
        coins: -amount,
        description: `Requested payout via ${method}`,
        createdAt: serverTimestamp()
    });

    try {
        await batch.commit();
        
        showToast("Withdrawal request submitted successfully!", "success");
        
        // Update local state and animate
        state.userDoc.coins -= amount;
        animateCounter("user-wallet-coins", state.userDoc.coins, 600);
        
        // Reset Form
        withdrawForm.reset();
        methodSelect.value = "";

    } catch (err) {
        console.error("Withdrawal transaction failed:", err);
        showToast("Failed to process transaction. Try again.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit Request <i class="fa-solid fa-paper-plane"></i>`;
    }
}

// Bind realtime withdrawal history
let historyUnsubscribe = null;
function bindRealtimeWithdrawalHistory() {
    const telegramId = String(state.tgUser.id);
    const q = query(
        collection(db, "withdraws"),
        where("telegramId", "==", telegramId),
        orderBy("createdAt", "desc")
    );

    if (historyUnsubscribe) historyUnsubscribe();

    historyUnsubscribe = onSnapshot(q, (snapshot) => {
        historyRows.innerHTML = "";
        
        if (snapshot.empty) {
            historyRows.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">
                        No withdrawal requests yet.
                    </td>
                </tr>
            `;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const row = document.createElement("tr");
            
            let statusBadge = "";
            if (data.status === "pending") {
                statusBadge = `<span class="badge badge-pending">Pending</span>`;
            } else if (data.status === "approved") {
                statusBadge = `<span class="badge badge-approved">Approved</span>`;
            } else if (data.status === "rejected") {
                statusBadge = `<span class="badge badge-rejected">Rejected</span>`;
            }

            row.innerHTML = `
                <td><strong>${escapeHtml(data.method)}</strong><br><span style="font-size:11px; color:var(--text-muted);">${escapeHtml(data.number)}</span></td>
                <td>${data.amount} Coins</td>
                <td>${statusBadge}</td>
            `;
            historyRows.appendChild(row);
        });
    }, (err) => {
        console.error("Realtime withdrawal history listener failed:", err);
        historyRows.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; color:var(--danger); padding:20px;">
                    Failed to sync transaction history.
                </td>
            </tr>
        `;
    });
}

// Clean up listener on unload
window.addEventListener("unload", () => {
    if (historyUnsubscribe) historyUnsubscribe();
});

// Helper: Escape HTML
function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
