// Mega Task BD - Global App Controller
import { 
    auth, db, signInAnonymously, onAuthStateChanged,
    doc, getDoc, setDoc, updateDoc, writeBatch, increment, serverTimestamp
} from "./firebase.js";

// Global App State
export const state = {
    tgUser: null,        // Telegram User Object
    userDoc: null,       // Firestore User Document data
    settings: null,      // Firestore System Settings data
    isConnected: true,
    isVpnValid: true
};

// Elements
const connectionOverlay = document.getElementById('connection-overlay');
const toastContainer = document.getElementById('toast-container');

// Initialize Telegram WebApp
export function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Closing confirmation
        if (tg.enableClosingConfirmation) {
            tg.enableClosingConfirmation();
        }
        
        // Haptic feedback helper
        state.haptic = tg.HapticFeedback;

        // User data
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            state.tgUser = tg.initDataUnsafe.user;
            // Get referral start parameter if available
            state.referBy = tg.initDataUnsafe.start_param || null;
        }
    }
    
    // Fallback Mock User for local browser testing
    if (!state.tgUser) {
        setupMockUserModal();
    }
}

// Mock User Modal for Testing
function setupMockUserModal() {
    console.log("Not running inside Telegram. Setting up Mock User...");
    
    // Default mock user
    state.tgUser = {
        id: 987654321,
        first_name: "Test",
        last_name: "User",
        username: "test_user",
        photo_url: "https://placekitten.com/150/150"
    };
    
    // Look for start_param in URL query (?startapp=12345)
    const urlParams = new URLSearchParams(window.location.search);
    state.referBy = urlParams.get('startapp') || null;
}

// Fetch User IP and Country Info
async function fetchGeoIp() {
    try {
        const res = await fetch("https://ipapi.co/json/");
        if (!res.ok) throw new Error("GeoIP fetch failed");
        const data = await res.json();
        return {
            ip: data.ip || "Unknown",
            country: data.country_code || "US",
            country_name: data.country_name || "United States"
        };
    } catch (e) {
        console.warn("Primary GeoIP API failed. Using fallback...", e);
        try {
            const res2 = await fetch("https://api.db-ip.com/v2/free/self");
            const data2 = await res2.json();
            return {
                ip: data2.ipAddress || "Unknown",
                country: data2.countryCode || "US",
                country_name: data2.countryName || "United States"
            };
        } catch (err) {
            return { ip: "127.0.0.1", country: "US", country_name: "United States" };
        }
    }
}

// Show Toast Notification
export function showToast(message, type = 'success') {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} active`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
    
    // Play haptic feedback on Telegram if available
    if (state.haptic) {
        if (type === 'error') state.haptic.notificationOccurred('error');
        else if (type === 'warning') state.haptic.notificationOccurred('warning');
        else state.haptic.notificationOccurred('success');
    }
}

// Connection Status Detector
function setupConnectionDetector() {
    const updateOnlineStatus = () => {
        state.isConnected = navigator.onLine;
        if (connectionOverlay) {
            if (state.isConnected) {
                connectionOverlay.classList.remove('active');
            } else {
                connectionOverlay.classList.add('active');
            }
        }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

// Parse Device Info
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    if (ua.indexOf("Windows") !== -1) os = "Windows";
    else if (ua.indexOf("Android") !== -1) os = "Android";
    else if (ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) os = "iOS";
    else if (ua.indexOf("Mac") !== -1) os = "MacOS";
    else if (ua.indexOf("Linux") !== -1) os = "Linux";
    
    return {
        os: os,
        browser: navigator.appName,
        userAgent: ua
    };
}

// Verify VPN & Country Settings
export function checkVpnAccess() {
    if (!state.settings || !state.settings.vpnEnabled) {
        state.isVpnValid = true;
        hideVpnRequiredScreen();
        return;
    }

    const allowed = state.settings.vpnAllowedCountries || [];
    const userCountry = state.userDoc?.country || "US";
    
    // If user's country is not in the allowed list
    if (allowed.length > 0 && !allowed.includes(userCountry.toUpperCase())) {
        state.isVpnValid = false;
        showVpnRequiredScreen(userCountry, allowed);
    } else {
        state.isVpnValid = true;
        hideVpnRequiredScreen();
    }
}

function showVpnRequiredScreen(userCountry, allowed) {
    let vpnOverlay = document.getElementById('vpn-overlay');
    if (!vpnOverlay) {
        vpnOverlay = document.createElement('div');
        vpnOverlay.id = 'vpn-overlay';
        vpnOverlay.className = 'connection-overlay active';
        document.body.appendChild(vpnOverlay);
    }
    
    const allowedList = allowed.join(', ');
    const downloadLink = state.settings?.vpnDownloadLink || "https://play.google.com/store/apps/details?id=com.fast.free.unblock.secure.vpn";
    
    vpnOverlay.innerHTML = `
        <div class="connection-icon">🔒</div>
        <h2>VPN Connection Required</h2>
        <p style="margin: 10px 0; font-size: 14px; color: var(--text-secondary);">
            Your current detected country is <strong>${userCountry}</strong>.
            This application is only accessible from: <strong>${allowedList}</strong>.
        </p>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
            Please connect to a VPN location in one of the allowed countries.
        </p>
        <a href="${downloadLink}" target="_blank" class="btn-premium" style="text-decoration:none; display:inline-flex;">
            Download Allowed VPN
        </a>
    `;
    vpnOverlay.classList.add('active');
}

function hideVpnRequiredScreen() {
    const vpnOverlay = document.getElementById('vpn-overlay');
    if (vpnOverlay) {
        vpnOverlay.classList.remove('active');
    }
}

// User Profile Sync & Anonymous Auth
export async function syncUserSession(onSyncCallback) {
    initTelegram();
    setupConnectionDetector();
    
    // Authenticate with Firebase Anonymously
    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.error("Firebase Anonymous Auth Failed:", err);
        showToast("Authentication Failed. Retrying...", "error");
        return;
    }
    
    // Wait for auth resolution
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        
        const telegramId = String(state.tgUser.id);
        const userRef = doc(db, "users", telegramId);
        
        try {
            // Get Geo-IP info
            const geo = await fetchGeoIp();
            const device = getDeviceInfo();
            
            const userSnap = await getDoc(userRef);
            
            // Sync settings first
            const settingsSnap = await getDoc(doc(db, "settings", "system"));
            if (settingsSnap.exists()) {
                state.settings = settingsSnap.data();
            } else {
                console.warn("System settings not found in Firestore. Using defaults.");
                state.settings = {
                    vpnEnabled: false,
                    premiumReward: 10,
                    dailyReward: 25,
                    coinsPerReferral: 15,
                    minWithdraw: 1000
                };
            }
            
            if (userSnap.exists()) {
                // Update existing user login
                const currentData = userSnap.data();
                
                if (currentData.isBlocked) {
                    showBlockedScreen();
                    return;
                }
                
                const updatePayload = {
                    lastLogin: serverTimestamp(),
                    deviceInfo: device,
                    ip: geo.ip,
                    country: geo.country,
                    username: state.tgUser.username || currentData.username || "",
                    fullname: `${state.tgUser.first_name || ""} ${state.tgUser.last_name || ""}`.trim() || currentData.fullname,
                    photo: state.tgUser.photo_url || currentData.photo || ""
                };
                
                await updateDoc(userRef, updatePayload);
                state.userDoc = { ...currentData, ...updatePayload };
            } else {
                // Create new user record
                const batch = writeBatch(db);
                
                const newUser = {
                    telegramId: telegramId,
                    uid: user.uid,
                    username: state.tgUser.username || "",
                    fullname: `${state.tgUser.first_name || ""} ${state.tgUser.last_name || ""}`.trim() || "Mega User",
                    photo: state.tgUser.photo_url || "",
                    coins: 0,
                    premiumCompleted: 0,
                    dailyCompleted: null,
                    referBy: null,
                    referCount: 0,
                    referCoins: 0,
                    isBlocked: false,
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp(),
                    deviceInfo: device,
                    country: geo.country,
                    ip: geo.ip
                };
                
                // Referral Handling
                if (state.referBy && state.referBy !== telegramId) {
                    const referrerId = String(state.referBy);
                    const referrerRef = doc(db, "users", referrerId);
                    const referrerSnap = await getDoc(referrerRef);
                    
                    if (referrerSnap.exists()) {
                        newUser.referBy = referrerId;
                        
                        // Increment referrer stats
                        const referralReward = Number(state.settings.coinsPerReferral) || 10;
                        batch.update(referrerRef, {
                            referCount: increment(1),
                            referCoins: increment(referralReward),
                            coins: increment(referralReward)
                        });
                        
                        // Create Referral History log for Referrer
                        const refHistoryRef = doc(collection(db, "history"));
                        batch.set(refHistoryRef, {
                            telegramId: referrerId,
                            type: "referral",
                            referenceId: telegramId,
                            coins: referralReward,
                            description: `Referral signup: ${newUser.fullname}`,
                            createdAt: serverTimestamp()
                        });
                    }
                }
                
                batch.set(userRef, newUser);
                await batch.commit();
                state.userDoc = newUser;
            }
            
            // Check VPN restriction
            checkVpnAccess();
            
            // Trigger UI binding callback
            if (onSyncCallback) onSyncCallback();
            
        } catch (e) {
            console.error("Error syncing user data:", e);
            showToast("Database Connection Error", "error");
        }
    });
}

function showBlockedScreen() {
    document.body.innerHTML = `
        <div class="connection-overlay active" style="background:#060713;">
            <div class="connection-icon">🚫</div>
            <h2>Account Blocked</h2>
            <p style="margin: 10px 0; font-size: 14px; color: var(--text-secondary);">
                Your account has been suspended by the administrator due to policy violations.
            </p>
            <p style="font-size: 13px; color: var(--text-muted);">
                If you think this is a mistake, please contact support.
            </p>
        </div>
    `;
}

// Notification Popups Listener
export function setupNotificationsListener() {
    const notifyRef = collection(db, "notifications");
    // Get last 1 hour notifications or just listen to new ones
    onSnapshot(notifyRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const notif = change.doc.data();
                // Check if notification has already been shown (optional timestamp filter)
                if (notif.createdAt && (Date.now() - notif.createdAt.toMillis() < 30000)) {
                    triggerPopup(notif);
                }
            }
        });
    });
}

function triggerPopup(notif) {
    let popup = document.getElementById('notif-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'notif-popup';
        popup.className = 'modal-overlay';
        document.body.appendChild(popup);
    }
    
    popup.innerHTML = `
        <div class="modal-content">
            ${notif.imageUrl ? `<img src="${notif.imageUrl}" style="width:100%; border-radius:12px; margin-bottom:12px; height: 140px; object-fit: cover;">` : ''}
            <h3 class="modal-title">${notif.title}</h3>
            <p class="modal-desc">${notif.description}</p>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${notif.buttonText && notif.buttonUrl ? `
                    <a href="${notif.buttonUrl}" target="_blank" class="btn-premium" style="text-decoration:none;">
                        ${notif.buttonText}
                    </a>
                ` : ''}
                <button class="btn-secondary" onclick="document.getElementById('notif-popup').classList.remove('active')">
                    Dismiss
                </button>
            </div>
        </div>
    `;
    popup.classList.add('active');
}

// Pull-To-Refresh Simulation
export function initPullToRefresh(refreshCallback) {
    let touchstart = 0;
    let touchend = 0;
    const ptr = document.getElementById('ptr-indicator');
    
    document.addEventListener('touchstart', e => {
        touchstart = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        const current = e.changedTouches[0].screenY;
        if (window.scrollY === 0 && current > touchstart && ptr) {
            const diff = Math.min(60, (current - touchstart) / 2);
            ptr.style.height = `${diff}px`;
        }
    }, { passive: true });

    document.addEventListener('touchend', async e => {
        touchend = e.changedTouches[0].screenY;
        if (window.scrollY === 0 && (touchend - touchstart) > 100 && ptr) {
            ptr.style.height = '40px';
            if (refreshCallback) {
                await refreshCallback();
            }
            setTimeout(() => {
                ptr.style.height = '0';
            }, 300);
        } else if (ptr) {
            ptr.style.height = '0';
        }
    }, { passive: true });
}

// Live Text Counters Animator
export function animateCounter(elementId, targetValue, duration = 1000) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    let start = 0;
    const end = parseInt(targetValue) || 0;
    if (start === end) {
        el.textContent = end;
        return;
    }
    
    const range = end - start;
    let current = start;
    const incrementStep = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    const timer = setInterval(() => {
        current += incrementStep;
        el.textContent = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, Math.max(stepTime, 10));
}
