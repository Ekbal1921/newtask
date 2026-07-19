// Mega Task BD - Referral Controller
import { state, syncUserSession, showToast, initPullToRefresh, animateCounter } from "./app.js";

// DOM Elements
const bonusText = document.getElementById("referral-bonus-text");
const referralUrlVal = document.getElementById("referral-link-val");
const copyBtn = document.getElementById("btn-copy-link");
const referCount = document.getElementById("refer-total-count");
const referCoins = document.getElementById("refer-total-coins");
const noticeText = document.getElementById("referral-notice-text");

// Initialize Page
document.addEventListener("DOMContentLoaded", () => {
    syncUserSession(async () => {
        setupTelegramBackButton();
        bindReferralData();
    });

    // Pull to Refresh support
    initPullToRefresh(async () => {
        syncUserSession(() => {
            bindReferralData();
            showToast("Referral data updated", "success");
        });
    });

    // Copy Button Handler
    copyBtn.addEventListener("click", () => {
        handleCopyLink();
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

// Bind Referral data to UI
function bindReferralData() {
    if (!state.userDoc || !state.settings) return;

    const telegramId = String(state.userDoc.telegramId);
    const botUsername = state.settings.botUsername || "MegaTaskBDBot";
    const referralReward = state.settings.coinsPerReferral || 10;
    
    // Construct Link
    const refLink = `https://t.me/${botUsername}?startapp=${telegramId}`;
    referralUrlVal.textContent = refLink;

    // Set Text Labels
    bonusText.textContent = `প্রতি রেফারে পাবেন: ${referralReward} কয়েন`;
    noticeText.innerHTML = state.settings.referralNotice || `
        ১. আপনার রেফারেল লিংকটি বন্ধুদের সাথে শেয়ার করুন।<br>
        ২. তারা যখনই এই মিনি অ্যাপটি চালু করবে, আপনি সাথে সাথে কয়েন পেয়ে যাবেন।<br>
        ৩. কোনো ফেক বা ডুপ্লিকেট রেফার করার চেষ্টা করবেন না, অন্যথায় আপনার অ্যাকাউন্ট ব্লক করা হতে পারে।
    `;

    // Animate stats counters
    animateCounter("refer-total-count", state.userDoc.referCount || 0, 800);
    animateCounter("refer-total-coins", state.userDoc.referCoins || 0, 800);
}

// Clipboard copy operation
function handleCopyLink() {
    const textToCopy = referralUrlVal.textContent;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showToast("Referral link copied!", "success");
            })
            .catch((err) => {
                console.error("Clipboard copy failed:", err);
                fallbackCopyText(textToCopy);
            });
    } else {
        fallbackCopyText(textToCopy);
    }
}

// Fallback copy logic for older mobile browsers
function fallbackCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Prevent scrolling
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand("copy");
        if (successful) {
            showToast("Referral link copied!", "success");
        } else {
            showToast("Failed to copy link. Please manually copy.", "error");
        }
    } catch (err) {
        console.error("Fallback copy failed:", err);
        showToast("Failed to copy link", "error");
    }
    
    document.body.removeChild(textArea);
}
