// --- START: Firebase v9 Compat SDK ---

let auth = null;
let db = null;
let functions = null;
let googleProvider = null;

// Check if the Firebase SDK loaded successfully (it might fail offline)
const isFirebaseAvailable = typeof firebase !== 'undefined';

if (isFirebaseAvailable) {
    try {
        // Your web app's Firebase configuration
        const firebaseConfig = {
          apiKey: "AIzaSyDqeMo-i8s1JlpeUk5aDRynPM8VVg7jHlg",
          authDomain: "fodmaplogmap-app.firebaseapp.com",
          projectId: "fodmaplogmap-app",
          storageBucket: "fodmaplogmap-app.firebasestorage.app",
          messagingSenderId: "616587045877",
          appId: "1:616587045877:web:93e53301bba7b3350f4ebc"
        };

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);

        // Get handles to the services
        auth = firebase.auth();
        db = firebase.firestore();
        // NEW: Initialize Cloud Functions
        functions = firebase.functions();
        
        db.enablePersistence().catch(err => {
            if (err.code == 'failed-precondition') {
                console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
            } else if (err.code == 'unimplemented') {
                console.warn('The current browser does not support all of the features required to enable persistence');
            }
        });
        
        googleProvider = new firebase.auth.GoogleAuthProvider();
    } catch (e) {
        console.error("Firebase init failed:", e);
    }
} else {
    console.warn("Firebase SDK not loaded. App running in restricted offline mode.");
}

// --- END: Firebase v9 Compat SDK ---

// --- GLOBAL HELPERS (Safe for Offline/Early execution) ---

/**
 * Shows a toast message. Safe to call anytime.
 */
function showToast(message = "Saved!", status = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return; // Failsafe if DOM isn't ready

    toast.textContent = message;
    
    // Calculate top position dynamically
    const bodyPaddingTop = document.body.style.paddingTop || '100px';
    
    let colorClass = 'bg-accent'; // default
    switch (status) {
        case 'error': colorClass = 'bg-error'; break;
        case 'warning': colorClass = 'bg-warning'; break;
        case 'pre-treatment': colorClass = 'bg-toast-pre'; break;
        case 'restriction': colorClass = 'bg-toast-restriction'; break;
        case 'reintroduction': colorClass = 'bg-toast-reintro'; break;
        case 'personalization': colorClass = 'bg-toast-personal'; break;
    }
    
    // Reset classes
    toast.className = `fixed left-4 right-4 mx-auto w-fit py-2 px-4 rounded-lg shadow-xl opacity-0 transform -translate-y-10 transition-all duration-500 ease-in-out text-sm z-[100] pointer-events-none ${colorClass}`;
    
    // Set position
    toast.style.top = `calc(${bodyPaddingTop} + 0.5rem)`;
    
    // Show
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', '-translate-y-10', 'pointer-events-none');
    });
    
    // Hide after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-10', 'pointer-events-none');
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {

    // --- START: i18next Initialization ---
    i18next
        .use(i18nextHttpBackend)
        .use(i18nextBrowserLanguageDetector)
        .init({
            fallbackLng: 'en',
            debug: true,
            load: 'languageOnly',
            backend: {
                loadPath: './locales/{{lng}}/translation.json'
            },
            interpolation: {
                escapeValue: false
            }
        }, function(err, t) {
            if (err) {
                console.error('i18n init failed:', err);
                // Even if it fails, we keep the default English data
                return;
            }
            console.log('i18n initialized. Language:', i18next.language);
            updateContent();
            updateDynamicData(); 
        });

    // Helper to update all static HTML elements
    function updateContent() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const options = el.getAttribute('data-i18n-options');
            
            if (options) {
                el.innerHTML = i18next.t(key, JSON.parse(options));
            } else {
                el.innerHTML = i18next.t(key);
            }
        });
    }
    // --- END: i18next Initialization ---

    // --- NEW: Premium Info Modal Elements (Moved to top) ---
    const premiumInfoModal = document.getElementById('premium-info-modal');
    const premiumInfoClose = document.getElementById('premium-info-close');
    const premiumInfoCta = document.getElementById('premium-info-cta');
    const premiumInfoCancel = document.getElementById('premium-info-cancel');

    let deferredPrompt; // This will store the event for later use
    let unsubscribeFromFirestore = null; // Holds our real-time listener
    const installAppLi = document.getElementById('install-app-li');
    const installAppBtn = document.getElementById('install-app-btn');

    // --- Offline Indicator Logic ---
    const offlineIndicator = document.getElementById('offline-indicator');
    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            offlineIndicator.classList.add('hidden');
        } else {
            offlineIndicator.classList.remove('hidden');
            showToast("You are offline.", "warning");
        }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    // Check initial state
    if (!navigator.onLine) updateOnlineStatus();

     // --- CONSTANTS ---
     // These must be defined first to build the default profile
     // Initialize with defaults so the app works even if i18n fails
     let FODMAP_GROUP_DATA = [ 
        { value: "Fructose", name: "Fructose", examples: "(e.g., Honey, Mango)" }, 
        { value: "Lactose", name: "Lactose", examples: "(e.g., Milk, Yogurt)" }, 
        { value: "Fructans (Grains)", name: "Fructans - Grains", examples: "(e.g., Wheat, Rye)" }, 
        { value: "Fructans (Veg & Fruit)", name: "Fructans - Veg & Fruit", examples: "(e.g., Onion, Garlic)" }, 
        { value: "GOS", name: "Galactans (GOS)", examples: "(e.g., Beans, Lentils)" }, 
        { value: "Polyols (Sorbitol)", name: "Polyols - Sorbitol", examples: "(e.g., Avocado, Blackberry)" }, 
        { value: "Polyols (Mannitol)", name: "Polyols - Mannitol", examples: "(e.g., Cauliflower, Mushroom)" }, 
        { value: "Other", name: "Other / Unclassified", examples: "(Foods you're unsure how to classify)" }, 
        { value: "Safe Meal", name: "Safe Meal", examples: "(A non-challenge or safe meal)" } 
     ];

     function updateDynamicData() {
        FODMAP_GROUP_DATA = [ 
            { value: "Fructose", name: i18next.t('fodmap_groups.fructose'), examples: "(e.g., Honey, Mango)" }, 
            { value: "Lactose", name: i18next.t('fodmap_groups.lactose'), examples: "(e.g., Milk, Yogurt)" }, 
            { value: "Fructans (Grains)", name: i18next.t('fodmap_groups.fructans_grain'), examples: "(e.g., Wheat, Rye)" }, 
            { value: "Fructans (Veg & Fruit)", name: i18next.t('fodmap_groups.fructans_veg'), examples: "(e.g., Onion, Garlic)" }, 
            { value: "GOS", name: i18next.t('fodmap_groups.gos'), examples: "(e.g., Beans, Lentils)" }, 
            { value: "Polyols (Sorbitol)", name: i18next.t('fodmap_groups.sorbitol'), examples: "(e.g., Avocado, Blackberry)" }, 
            { value: "Polyols (Mannitol)", name: i18next.t('fodmap_groups.mannitol'), examples: "(e.g., Cauliflower, Mushroom)" }, 
            { value: "Other", name: i18next.t('fodmap_groups.other'), examples: "(Foods you're unsure how to classify)" }, 
            { value: "Safe Meal", name: i18next.t('fodmap_groups.safe_meal'), examples: "(A non-challenge or safe meal)" } 
        ];
        
        // Re-render components that depend on this data
        if (typeof renderLogEntries === 'function') renderLogEntries();
        if (typeof renderHomePage === 'function') renderHomePage();
        if (typeof renderPersonalizationSummary === 'function') renderPersonalizationSummary();

        // --- ADD THIS: Force refresh the dropdown options if they exist ---
        const fodmapOptions = document.getElementById('custom-fodmap-select-options');
        if (fodmapOptions) {
            fodmapOptions.innerHTML = ''; // Clear old English options
            // Re-run the build logic (we can't call buildDropdown() directly as it's scoped, so we repeat the simple loop)
            FODMAP_GROUP_DATA.forEach(group => {
                 const option = document.createElement('li');
                 option.className = 'custom-select-option';
                 option.dataset.value = group.value;
                 const style = FODMAP_STYLES[group.value] || { icon: '❓' };
                 option.innerHTML = `
                    <div class="option-title">${style.icon} ${group.name}</div>
                    <div class="option-examples">${group.examples}</div>
                `;
                fodmapOptions.appendChild(option);
            });
        }
     }
     
     const FODMAP_STYLES = { "Fructose": { color: "bg-yellow-100 text-yellow-800", icon: "🍎" }, "Lactose": { color: "bg-blue-100 text-blue-800", icon: "🥛" }, "Fructans (Grains)": { color: "bg-orange-100 text-orange-800", icon: "🍞" }, "Fructans (Veg & Fruit)": { color: "bg-purple-100 text-purple-800", icon: "🧅" }, "GOS": { color: "bg-teal-100 text-teal-800", icon: "🫘" }, "Polyols (Sorbitol)": { color: "bg-green-100 text-green-800", icon: "🥑" }, "Polyols (Mannitol)": { color: "bg-indigo-100 text-indigo-800", icon: "🍄" }, "Other": { color: "bg-gray-100 text-gray-800", icon: "❔" }, "Safe Meal": { color: "bg-slate-100 text-slate-800", icon: "🍴" } };
     const PROFILE_OPTIONS = { diagnoses: ["IMO", "SIBO", "IBS-D", "IBS-C", "IBS-M"], intolerances: ["Sorbitol", "Mannitol", "Lactose", "Fructose", "Gluten"], preferences: ["Vegetarian", "Vegan", "Pescatarian"] };
     const SYMPTOM_OPTIONS = ["Bloating", "Gas", "Abdominal pain", "Diarrhea", "Constipation", "Fatigue", "Headache"];

    const PHASE_STYLES = {
        "pre-treatment": { label: "Pre-Treatment", colorClass: "phase-pre-treatment", colorHex: "#f59e0b", colorHexDark: "#d97706", textColor: "#ffffff" },
        "restriction": { label: "Restriction", colorClass: "phase-restriction", colorHex: "#8bb744", colorHexDark: "#6a9335", textColor: "#ffffff" },
        "reintroduction": { label: "Reintroduction", colorClass: "phase-reintroduction", colorHex: "#2d61a0", colorHexDark: "#283b6c", textColor: "#ffffff" },
        "personalization": { label: "Personalization", colorClass: "phase-personalization", colorHex: "#4a0076", colorHexDark: "#3b005f", textColor: "#ffffff" }
    };

    // --- DOM Elements (mostly constant) ---
    const pages = document.querySelectorAll('.page');
    const navItems = document.querySelectorAll('.nav-item');
    const addEntryFab = document.getElementById('add-entry-fab');
    const hamBtn = document.getElementById('hamburger-btn'); const sideMdl = document.getElementById('side-menu-modal'); const sideOvl = document.getElementById('side-menu-overlay'); const sideClose = document.getElementById('side-menu-close'); const openInfoBtn = document.getElementById('open-info-modal-btn'); const infoMdl = document.getElementById('info-modal'); const infoClose = document.getElementById('info-modal-close'); const infoCloseBtn = document.getElementById('info-modal-close-btn');
    const logEntryModal = document.getElementById('log-entry-modal');
    const logModalTitle = document.getElementById('log-modal-title');
    const logModalClose = document.getElementById('log-modal-close');
    const logFormSubmitBtn = document.getElementById('log-form-submit-btn');
    const logFormCancelBtn = document.getElementById('log-form-cancel-edit');

    // --- NEW: GDPR Elements ---
    const authLegalCheckboxes = document.getElementById('auth-legal-checkboxes');
    const authCheckTerms = document.getElementById('auth-check-terms');
    const authCheckHealth = document.getElementById('auth-check-health');

    // --- NEW: Google Consent Elements ---
    const authViewGoogleConsent = document.getElementById('auth-view-google-consent');
    const googleCheckTerms = document.getElementById('google-check-terms');
    const googleCheckHealth = document.getElementById('google-check-health');
    const googleConsentConfirmBtn = document.getElementById('google-consent-confirm-btn');
    const googleConsentCancelBtn = document.getElementById('google-consent-cancel-btn');

    // --- Phase-Controlled Elements ---
    const progressCard = document.getElementById('home-progress-card');
    const insightsCard = document.getElementById('home-insights-card');
    const pretreatmentCard = document.getElementById('home-pre-treatment-card');
    const chartCard = document.getElementById('home-chart-card');
    const restrictionCard = document.getElementById('home-restriction-card');
    const personalizationCard = document.getElementById('home-personalization-card');
    const planChallengeBtn = document.getElementById('plan-challenge-btn');
    const fodmapSelectContainer = document.getElementById('custom-fodmap-select-container');
    const fodmapHiddenInput = document.getElementById('log-fodmap-group');

    // --- Medication Tracker Elements ---
    const medicationTrackerCard = document.getElementById('medication-tracker-card');
    const medicationTrackerEmpty = document.getElementById('medication-tracker-empty');
    const medicationTrackerFull = document.getElementById('medication-tracker-full');
    const medicationChecklist = document.getElementById('medication-checklist');
    const medicationLogAccordion = document.getElementById('medication-log-accordion');
    const medicationLogHistory = document.getElementById('medication-log-history');

    // --- Onboarding Modal Elements ---
    const onboardingModal = document.getElementById('onboarding-modal');
    const onboardingModalClose = document.getElementById('onboarding-modal-close');
    const openOnboardingBtn = document.getElementById('open-onboarding-btn');

    // --- Auth Modal Elements ---
    const authModal = document.getElementById('auth-modal');
    const authModalClose = document.getElementById('auth-modal-close');
    const authModalTitle = document.getElementById('auth-modal-title');
    const authGoogleBtn = document.getElementById('auth-google-btn');
    const authForm = document.getElementById('auth-form');
    const authNameField = document.getElementById('auth-name-field');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    const authNameInput = document.getElementById('auth-name');
    const authError = document.getElementById('auth-error');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSwitchBtn = document.getElementById('auth-switch-btn');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const authPasswordToggle = document.getElementById('auth-password-toggle');
    const authForgotPasswordLink = document.getElementById('auth-forgot-password-link');
    const authContinueGuestBtn = document.getElementById('auth-continue-guest-btn');
    const authGuestHelpBtn = document.getElementById('auth-guest-help-btn');

    // --- NEW: Verification Elements ---
    const authViewForm = document.getElementById('auth-view-form');
    const authViewVerify = document.getElementById('auth-view-verify');
    const authVerifyEmailDisplay = document.getElementById('auth-verify-email-display');
    const authVerifyDoneBtn = document.getElementById('auth-verify-done-btn');
    const authVerifyResendBtn = document.getElementById('auth-verify-resend-btn');
    const authVerifySkipBtn = document.getElementById('auth-verify-skip-btn');
    
    const verificationBanner = document.getElementById('verification-banner');
    const bannerResendBtn = document.getElementById('banner-resend-btn');
    const bannerVerifyCheckBtn = document.getElementById('banner-verify-check-btn'); // NEW
    
    const accountEmailStatus = document.getElementById('account-email-status');
    // Removed accountResendBtn

    const menuLoginBtn = document.getElementById('menu-login-btn');
    const menuLoginLi = document.getElementById('menu-login-li');
    const menuPremiumLi = document.getElementById('menu-premium-li');
    const menuLogoutLi = document.getElementById('menu-logout-li');
    const menuLogoutBtn = document.getElementById('menu-logout-btn');

    // --- NEW: Account Settings Elements ---
    const menuAccountLi = document.getElementById('menu-account-li');
    const menuAccountBtn = document.getElementById('menu-account-btn');
    const menuAccountEmail = document.getElementById('menu-account-email');
    const accountSettingsPage = document.getElementById('account-settings');
    const accountBackBtn = document.getElementById('account-back-btn');
    const accountSettingsForm = document.getElementById('account-settings-form');
    const accountNameInput = document.getElementById('account-name');
    const accountEmailInput = document.getElementById('account-email');
    const accountSaveNameBtn = document.getElementById('account-save-name-btn');
    const accountPasswordResetBtn = document.getElementById('account-password-reset-btn');
    const accountDeleteBtn = document.getElementById('account-delete-btn');
    
    // Slides
    const onboardingSlides = document.querySelectorAll('.onboarding-slide');
    const slideWelcome = document.getElementById('onboarding-slide-welcome');
    const slideKnowMore = document.getElementById('onboarding-slide-know-more');
    const slideProfile = document.getElementById('onboarding-slide-profile');
    const slidePhaseSelect = document.getElementById('onboarding-slide-phase-select');
    const slidePhaseSetup = document.getElementById('onboarding-slide-phase-setup');
    const onboardingPhaseContent = document.querySelectorAll('.onboarding-phase-content');
    
    // Welcome Slide Buttons
    const onboardingActionSetup = document.getElementById('onboarding-action-setup');
    const onboardingActionKnowMore = document.getElementById('onboarding-action-know-more');
    
    // Footer
    const onboardingFooter = document.getElementById('onboarding-footer');
    const onboardingBtnSkip = document.getElementById('onboarding-btn-skip');
    const onboardingBtnBack = document.getElementById('onboarding-btn-back');
    const onboardingBtnNext = document.getElementById('onboarding-btn-next');
    const onboardingBtnFinish = document.getElementById('onboarding-btn-finish');
    const onboardingDots = document.getElementById('onboarding-dots');

    // Slide 3: Profile Form
    const obProfileDiagnoses = document.getElementById('onboarding-profile-diagnoses');
    const obProfileIntolerances = document.getElementById('onboarding-profile-intolerances');
    const obProfileAllergiesOther = document.getElementById('onboarding-profile-allergies-other');
    const obProfilePreferences = document.getElementById('onboarding-profile-preferences');

    // Slide 4: Phase Select
    const obPhaseSelectContainer = document.getElementById('onboarding-phase-btn-container');
    const obPhaseSelectValue = document.getElementById('onboarding-phase-select-value');
    
    // Slide 5: Pre-Treatment
    const obPtStartDate = document.getElementById('onboarding-pretreatment-start-date');
    const obPtDurationNum = document.getElementById('onboarding-pretreatment-duration-num');
    const obPtDurationUnit = document.getElementById('onboarding-pretreatment-duration-unit');
    const obPtRules = document.getElementById('onboarding-pretreatment-rules');
    
    // Slide 5: Restriction
    const obRsStartDate = document.getElementById('onboarding-restriction-start-date');
    const obRsDurationNum = document.getElementById('onboarding-restriction-duration-num');
    const obRsDurationUnit = document.getElementById('onboarding-restriction-duration-unit');
    
    // Slide 5: Medication
    const obMedStartDate = document.getElementById('onboarding-medication-start-date');
    const obMedDuration = document.getElementById('onboarding-medication-duration');
    const obMedList = document.getElementById('onboarding-medication-settings-list');
    const obMedAddBtn = document.getElementById('onboarding-medication-add-btn');
        
    // --- Application State Object ---

    const CHART_COLORS = {
        "Fructose": "rgba(250, 204, 21, 1)", // Yellow
        "Lactose": "rgba(96, 165, 250, 1)",  // Blue
        "Fructans (Grains)": "rgba(251, 146, 60, 1)", // Orange
        "Fructans (Veg & Fruit)": "rgba(192, 132, 252, 1)", // Purple
        "GOS": "rgba(45, 212, 191, 1)", // Teal
        "Polyols (Sorbitol)": "rgba(74, 222, 128, 1)", // Light Green
        "Polyols (Mannitol)": "rgba(129, 140, 248, 1)", // Indigo
        "Other": "rgba(236, 72, 153, 1)", // Pink (NEW)
        "Safe Meal": "rgba(22, 163, 74, 1)" // Dark Green (NEW)
    };

    let symptomChart = null; // Holds the chart instance

    // Define the default profile structure
    const defaultProfile = { 
        hasConsentedToGDPR: false, // NEW: Default to false for guests
        diagnoses: [], 
        intolerances: [], 
        allergiesOther: '', 
        preferences: [], 
        apiKey: '',
        hasCompletedOnboarding: false,
        ratePopupStatus: 'not_asked', // 'not_asked', 'remind_later', 'declined', 'rated'
        aiUsageCount: 0,
        isPremium: false,
        currentPhase: 'reintroduction',
        phaseSettings: {
            "pre-treatment": {
                startDate: null,
                durationNum: 4,
                durationUnit: 'weeks',
                rules: "Avoid: Lactose\nAvoid: Gluten\nAvoid: Apples\nAvoid: Peaches\nAvoid: Pears"
            },
            "restriction": {
                startDate: null,
                durationNum: 4,
                durationUnit: 'weeks'
            }
        },
        personalizationFoods: [],
            uiSettings: {
                isProgressExpanded: true
            },
            medicationTracker: {
            startDate: null,      // e.g., '2025-10-20'
            duration: 12,         // e.g., 12 (for 12 days)
            medications: [
                // { id: 'm1', time: '09:00', name: 'Antibiotic' },
                // { id: 'm2', time: '14:00', name: 'Antibiotic' }
            ],
            log: {
                // '2025-10-20': ['m1', 'm2'], // Stores IDs of taken doses
                // '2025-10-21': ['m1']
            }
        }
    };

    const savedProfile = localStorage.getItem('fodmapUserProfile') ? JSON.parse(localStorage.getItem('fodmapUserProfile')) : {};

    const appState = {
        logEntries: JSON.parse(localStorage.getItem('fodmapLogEntries')) || [],
        isSyncing: false,
        pendingGoogleUser: null, // Tracks a Google user awaiting GDPR consent
        logEntries: JSON.parse(localStorage.getItem('fodmapLogEntries')) || [],
        // Merge saved profile over defaults
        userProfile: { 
            ...defaultProfile, 
            ...savedProfile 
        },
        // personalizationFoods will be populated from userProfile after
        
        currentPageIndex: 0,
        currentlyEditingId: null,
        stagedImageData: null,
        stagedImageMimeType: null,
        currentLogView: 'date', // 'group' or 'date'
        currentDateSort: 'newest', // 'newest' or 'oldest'
        currentPersonalizationView: 'tolerance', // 'group' or 'tolerance'
        openLogFormOnLoad: false,
        currentMedicationIdCounter: 0, // Helper for unique med IDs
        notificationFallbackData: null, // Stores data from a notification click
        currentAuthMode: 'login', // 'login' or 'signup'
        // --- Onboarding State ---
        onboardingHistory: [], // To track slide navigation for 'Back' button
        currentOnboardingSlide: 0,
        onboardingSetupPath: 'setup' // 'setup' or 'knowMore'
    };

    // --- NEW: Deep merge/ensure personalizationFoods exists ---
    appState.userProfile.personalizationFoods = appState.userProfile.personalizationFoods || [];

    // Ensure uiSettings exists and has its defaults
    appState.userProfile.uiSettings = {
        ...(defaultProfile.uiSettings || {}), // Get defaults (isProgressExpanded: true)
        ...(savedProfile.uiSettings || {}) // Override with saved settings
    };

    /**
     * Gets a unique, sorted list of all food names from the log and profile.
     * @returns {string[]} A sorted array of unique, capitalized food names.
     */
    function getUniqueFoodNames() {
        const logFoods = appState.logEntries.map(entry => entry.food.trim());
        const profileFoods = appState.userProfile.personalizationFoods.map(food => food.name.trim());
        
        const allFoods = [...logFoods, ...profileFoods];
        
        // Use a Map to store the unique names, preferring the original capitalization
        // (This makes "Oatmeal" win over "oatmeal" if both exist)
        const uniqueNamesMap = new Map();
        allFoods.forEach(name => {
            const lowerName = name.toLowerCase();
            if (!uniqueNamesMap.has(lowerName)) {
                uniqueNamesMap.set(lowerName, name);
            }
        });

        // Return a sorted array of the unique, original-cased names
        return Array.from(uniqueNamesMap.values()).sort((a, b) => a.localeCompare(b));
    }

    /**
     * Shows autocomplete suggestions for the log food input.
     * @param {string[]} matches - Array of matching food names.
     * @param {HTMLElement} inputElement - The input element to position against.
     */
    function showAutocomplete(matches, inputElement) {
        const suggestionsList = document.getElementById('log-food-autocomplete');
        if (!suggestionsList) return;

        suggestionsList.innerHTML = ''; // Clear old suggestions
        if (matches.length === 0) {
            suggestionsList.style.display = 'none';
            return;
        }

        matches.forEach(match => {
            const li = document.createElement('li');
            li.textContent = match;
            li.addEventListener('mousedown', (e) => { // Use mousedown to fire before blur
                e.preventDefault(); // Prevent input from losing focus
                inputElement.value = match;
                hideAutocomplete(); // This will now also hide the check button
            });
            suggestionsList.appendChild(li);
        });

        suggestionsList.style.display = 'block';
    }

    function hideAutocomplete() {
        const suggestionsList = document.getElementById('log-food-autocomplete');
        if (suggestionsList) {
            suggestionsList.style.display = 'none';
            suggestionsList.innerHTML = '';
        }
        // NEW: Also hide the confirm button
        const confirmBtn = document.getElementById('log-food-confirm-btn');
        if (confirmBtn) {
            confirmBtn.style.display = 'none';
        }
    }

    /**
     * Converts a string to Title Case.
     * e.g., "apple slices" -> "Apple Slices"
     * @param {string} str - The string to convert.
     * @returns {string} The Title Cased string.
     */
    function toTitleCase(str) {
        if (!str) return '';
        return str.toLowerCase()
            .split(' ')
            .map(word => {
                if (word.length === 0) return '';
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    // --- MOVED HELPER FUNCTIONS (Fixes Offline Crash) ---

    // 1. Symptom Helper (Converted to function for hoisting)
    function hasSymptoms(entry) {
        const symptoms = entry.symptoms || ['None'];
        return !symptoms.includes('None') && symptoms.length > 0;
    }

    // 2. Layout Helper (Converted to function for hoisting)
    function calculatePadding() { 
        const h = document.querySelector('header');
        const pb = document.getElementById('phase-bar'); 
        const n = document.getElementById('main-nav'); 
        
        if (h && pb && n) { 
            const headerHeight = h.offsetHeight;
            const navHeight = n.offsetHeight;

            // Position the phase bar right below the header
            pb.style.top = `${headerHeight}px`; 
            
            // Get phase bar height AFTER setting its position
            const phaseBarHeight = pb.offsetHeight; 
            const totalTopHeight = headerHeight + phaseBarHeight;

            // Set padding for header, phase bar, and bottom nav
            document.body.style.paddingTop = `${totalTopHeight}px`;
            document.body.style.paddingBottom = `${navHeight}px`;

            // Set CSS variable to the TOTAL sticky height
            document.documentElement.style.setProperty('--header-height', `${totalTopHeight}px`);
        } 
    }

    /**
     * Updates the UI contextually based on the user's current phase.
     * This function is called on startup and whenever the phase is changed.
     * @param {string} phase - The current phase (e.g., 'restriction')
     */
    function updateUiForPhase(phase) {
        console.log(`Updating UI for phase: ${phase}`);

        // --- Update Phase Bar ---
        const phaseBar = document.getElementById('phase-bar');
        const phaseBarText = document.getElementById('phase-bar-text');
        const style = PHASE_STYLES[phase] || PHASE_STYLES['restriction']; // Default

        if (phaseBar && phaseBarText) {
            phaseBarText.textContent = style.label;
            // Remove all other phase classes
            phaseBar.classList.remove('phase-pre-treatment', 'phase-restriction', 'phase-reintroduction', 'phase-personalization');
            // Add the correct one
            phaseBar.classList.add(style.colorClass);
        }

        // --- Update FAB Color ---
        if (addEntryFab) { // addEntryFab is defined in the global scope
            addEntryFab.style.backgroundColor = style.colorHex;
        }

        // --- Update Adaptive CSS Variables ---
        const root = document.documentElement;
        root.style.setProperty('--color-adaptive-bg', style.colorHex);
        root.style.setProperty('--color-adaptive-bg-dark', style.colorHexDark);
        root.style.setProperty('--color-adaptive-text', style.textColor);

        // --- Define Phase Booleans ---
        const isPretreat = (phase === 'pre-treatment');
        const isRestrict = (phase === 'restriction');
        const phaseSettingsCard = document.getElementById('profile-phase-settings-card');
        const phaseSettingsTitle = document.getElementById('profile-phase-settings-title');
        const isReintro = (phase === 'reintroduction');
        const isPersonal = (phase === 'personalization');
        
        // --- Profile Page ---
        if (phaseSettingsCard) {
            // Both Pre-treatment and Restriction settings are now modals on the Home tab.
            phaseSettingsCard.classList.add('hidden');
        }

        // --- 1. Home Page Card Visibility ---
        if (pretreatmentCard) pretreatmentCard.classList.toggle('hidden', !isPretreat);
        if (restrictionCard) restrictionCard.classList.toggle('hidden', !isRestrict);
        if (progressCard) progressCard.classList.toggle('hidden', !isReintro);
        if (personalizationCard) personalizationCard.classList.toggle('hidden', !isPersonal);
        
        // Insights card: Show for Reintro ONLY
        if (insightsCard) insightsCard.classList.toggle('hidden', !isReintro);

        // Chart card: Show for Reintro ONLY
        if (chartCard) chartCard.classList.toggle('hidden', !isReintro);

        // --- Call Home Page Renderers ---
        if (isPretreat) {
            renderCountdown('pre-treatment');
            renderPreTreatmentCard(); // Add this call
        }
        if (isRestrict) renderCountdown('restriction');
        if (isRestrict) renderMedicationTracker();
        if (isReintro) renderHomePage(); // This is the reintro progress list
        if (isPersonal) renderPersonalizationSummary();
        
        // --- 4. Update Nav Tab Label ---
        const reintroTab = document.querySelector('button[data-page="daily-log"]');
        if (reintroTab) {
            const reintroTabText = reintroTab.querySelector('span');
            const reintroTabIcon = reintroTab.querySelector('i');
            
            // *** MODIFICATION: Add "Personal Log" ***
            if (isReintro) {
                if (reintroTabText) reintroTabText.textContent = 'Reintro Log';
                if (reintroTabIcon) reintroTabIcon.className = 'fas fa-clipboard-list sm:mr-2';
            } else if (isPersonal) {
                if (reintroTabText) reintroTabText.textContent = 'Personal Log';
                if (reintroTabIcon) reintroTabIcon.className = 'fas fa-book-medical sm:mr-2'; // Same icon as daily log
            } else {
                if (reintroTabText) reintroTabText.textContent = 'Daily Log';
                if (reintroTabIcon) reintroTabIcon.className = 'fas fa-book-medical sm:mr-2';
            }
        }

        // --- 5. Re-render Log Entries List (to be safe) ---
        renderLogEntries();

        // --- NEW: Update the log form UI ---
        updateLogFormForPhase(phase);

        // Recalculate padding AFTER rendering the phase bar
        calculatePadding();
    }

    /**
     * Updates the Log Form UI (Info Box, FODMAP selector) based on the current phase.
     */
    function updateLogFormForPhase(phase) {
        const infoBox = document.getElementById('log-form-info-box');
        const fodmapSelect = document.getElementById('custom-fodmap-select-container');
        const planBtn = document.getElementById('plan-challenge-btn');
        const options = document.querySelectorAll('#custom-fodmap-select-options .custom-select-option');

        if (!infoBox) return; // Safety check if elements aren't ready

        // 1. Reset all elements
        infoBox.classList.add('hidden');
        fodmapSelect.classList.add('hidden');
        planBtn.classList.add('hidden');
        options.forEach(opt => opt.style.display = 'block'); // Show all options by default

        // 2. Apply rules based on phase
        switch (phase) {
            case 'pre-treatment':
            case 'restriction':
                infoBox.innerHTML = `<strong>Your Goal:</strong> Log your meals and any symptoms. This helps establish a baseline.`;
                infoBox.classList.remove('hidden');
                // Fodmap select remains hidden
                break;

            case 'reintroduction':
                infoBox.innerHTML = `<strong>Your Goal:</strong> Log a <strong>specific</strong> FODMAP challenge. Select the group, food, and dose you are testing.`;
                infoBox.classList.remove('hidden');
                fodmapSelect.classList.remove('hidden');
                planBtn.classList.remove('hidden');
                
                // Hide "Safe Meal" and "Other" from dropdown
                options.forEach(opt => {
                    const val = opt.dataset.value;
                    if (val === 'Safe Meal' || val === 'Other') {
                        opt.style.display = 'none';
                    }
                });
                break;

            case 'personalization':
                infoBox.innerHTML = `<strong>Your Goal:</strong> Log new foods or mixed meals. This helps fine-tune your long-term, personalized diet.`;
                infoBox.classList.remove('hidden');
                fodmapSelect.classList.remove('hidden');
                // All dropdown options remain visible
                break;
        }
    }

    function navigateTo(pageId) {
        const targetPage = document.getElementById(pageId);
        if (!targetPage) return;

        pages.forEach(page => page.classList.add('hidden'));
        targetPage.classList.remove('hidden');
        
        navItems.forEach((item, index) => {
            const isActive = item.dataset.page === pageId;
            item.classList.toggle('active', isActive);
            if (isActive) {
                appState.currentPageIndex = index;
            }
        });
        
        // The floating action button is now always visible
        addEntryFab.classList.remove('hidden');

        window.scrollTo(0, 0);
         document.querySelectorAll('.nav-item span').forEach(span => { span.classList.remove('hidden', 'sm:inline'); span.classList.add('hidden', 'sm:inline'); });
    }

    function goToNextTab() {
        const nextIndex = (appState.currentPageIndex + 1) % navItems.length;
        const nextPageId = navItems[nextIndex].dataset.page;
        navigateTo(nextPageId);
    }

    function goToPrevTab() {
        const prevIndex = (appState.currentPageIndex - 1 + navItems.length) % navItems.length;
        const prevPageId = navItems[prevIndex].dataset.page;
        navigateTo(prevPageId);
    }

    navItems.forEach(item => item.addEventListener('click', () => navigateTo(item.dataset.page)));
    addEntryFab.addEventListener('click', () => { 
        showLogModal(null); // null = new entry
    });
    
    const aiFoodSearchInput = document.getElementById('ai-food-search-input');
    const imageUploadInput = document.getElementById('image-upload-input');
    const cameraUploadInput = document.getElementById('camera-upload-input');
    
    // New Elements
    const aiSendBtn = document.getElementById('ai-send-btn');
    const aiAttachBtn = document.getElementById('ai-attach-btn');
    const aiAttachPopup = document.getElementById('ai-attach-popup');
    const popupGalleryBtn = document.getElementById('popup-gallery-btn');
    const popupCameraBtn = document.getElementById('popup-camera-btn');
    
    // Staged Image Elements
    const stagedImageContainer = document.getElementById('staged-image-container');
    const imagePreview = document.getElementById('image-preview');
    const uploadPromptText = document.getElementById('upload-prompt-text');
    const clearStagedImageBtn = document.getElementById('clear-staged-image-btn');
    
    const aiResultsLoader = document.getElementById('ai-results-loader');
    const aiResultsContainer = document.getElementById('ai-results-container');
    const aiResultsContent = document.getElementById('ai-results-content');

    // --- NEW: AI Credits UI ---
    const aiUpgradeBanner = document.getElementById('ai-upgrade-banner');
    const aiCreditsText = document.getElementById('ai-credits-text'); // Add this selector

    const updatePremiumUI = () => {
        const profile = appState.userProfile;
        const isPremium = profile.isPremium === true;
        
        // 1. Menu Badge
        const menuBadge = document.getElementById('menu-pro-badge');
        if (menuBadge) menuBadge.classList.toggle('hidden', !isPremium);

        // 2. Account Settings Status
        const accountPremiumWrapper = document.getElementById('account-premium-wrapper');
        if (accountPremiumWrapper) accountPremiumWrapper.classList.toggle('hidden', !isPremium);

        // 3. Side Menu "Go Premium" Button (Hide if already premium)
        if (menuPremiumLi) menuPremiumLi.classList.toggle('hidden', isPremium);

        // 4. AI Banner (Hide if premium)
        if (aiUpgradeBanner && isPremium) {
            aiUpgradeBanner.classList.add('hidden');
        }
    };

    const updateAICounterUI = () => {
        if (!auth) {
            if (aiUpgradeBanner) aiUpgradeBanner.classList.add('hidden');
            return;
        }
        const user = auth.currentUser;
        const profile = appState.userProfile;
        
        // 1. Guest or Not Logged In
        if (!user) {
            if (aiUpgradeBanner) aiUpgradeBanner.classList.add('hidden');
            return;
        }

        // 2. Premium User (Hide the banner entirely)
        if (profile.isPremium) {
            if (aiUpgradeBanner) aiUpgradeBanner.classList.add('hidden');
            return;
        }

        // 3. Free User (Always show banner, just change text)
        const limit = 5; // Must match backend
        const used = profile.aiUsageCount || 0;
        const remaining = Math.max(0, limit - used);

        if (aiUpgradeBanner && aiCreditsText) {
            aiUpgradeBanner.classList.remove('hidden');
            
            if (remaining > 0) {
                // Has credits: Show count
                aiCreditsText.innerHTML = `⚡ <strong>${remaining} / ${limit}</strong> Free AI Credits Left`;
            } else {
                // No credits: Show warning
                aiCreditsText.innerHTML = `You are out of free AI credits.`;
            }
        }
    };
    
    const buildProfileContext = () => {
        let context = "User profile:"; let hasInfo = false;
        if (appState.userProfile.diagnoses.length > 0) { context += ` Diagnoses: ${appState.userProfile.diagnoses.join(', ')}.`; hasInfo = true; }
        const allIntolerances = [...appState.userProfile.intolerances, appState.userProfile.allergiesOther].filter(Boolean);
        if (allIntolerances.length > 0) { context += ` Intolerances/Allergies: ${allIntolerances.join(', ')}.`; hasInfo = true; }
        if (appState.userProfile.preferences.length > 0) { context += ` Preferences: ${appState.userProfile.preferences.join(', ')}.`; hasInfo = true; }
        return hasInfo ? context : "User profile not specified.";
    };

    const getProfileForDisplay = () => {
        let displayLines = [];
        if (appState.userProfile.diagnoses.length > 0) { displayLines.push(`<strong>Diagnoses:</strong> ${appState.userProfile.diagnoses.join(', ')}`); }
        const allIntolerances = [...appState.userProfile.intolerances, appState.userProfile.allergiesOther].filter(Boolean);
        if (allIntolerances.length > 0) { displayLines.push(`<strong>Intolerances/Allergies:</strong> ${allIntolerances.join(', ')}`); }
        if (appState.userProfile.preferences.length > 0) { displayLines.push(`<strong>Preferences:</strong> ${appState.userProfile.preferences.join(', ')}`); }
        
        if (displayLines.length === 0) return null;
        return displayLines.join('<br>');
    };

    const populateFormForEdit = (entry) => {
        document.getElementById('log-date').value = entry.date;
        document.getElementById('log-fodmap-group').value = entry.group;
        // Update the visible text of the custom dropdown
        const groupData = FODMAP_GROUP_DATA.find(g => g.value === entry.group);
        const style = FODMAP_STYLES[entry.group] || { icon: '❓' };
        const triggerText = document.getElementById('custom-fodmap-select-text');
        const trigger = document.getElementById('custom-fodmap-select-trigger');
        
        if (groupData) {
            triggerText.textContent = `${style.icon} ${groupData.name}`;
            trigger.classList.remove('placeholder');
        } else {
            triggerText.textContent = 'Select FODMAP Group...';
            trigger.classList.add('placeholder');
        }
        document.getElementById('log-food').value = entry.food;
        document.getElementById('log-dose').value = entry.dose;
        document.getElementById('log-notes').value = entry.notes;

        // --- Populate Symptoms ---
        // 1. Reset all fields first
        document.querySelectorAll('input[name="symptoms"]').forEach(cb => cb.checked = false);
        const customTagsContainer = document.getElementById('custom-symptom-tags-container');
        customTagsContainer.innerHTML = '';
        
        const symptoms = entry.symptoms || ['None'];
        let hasSymptoms = false;

        symptoms.forEach(symptom => {
            if (symptom === 'None') {
                document.getElementById('symptom-None').checked = true;
            } else {
                const predefined = document.getElementById(`symptom-${symptom}`);
                if (predefined) {
                    predefined.checked = true; // Check the box
                } else {
                    // It's a custom tag
                    const tag = document.createElement('div');
                    tag.className = 'custom-symptom-tag';
                    tag.textContent = symptom;
                    tag.innerHTML += `<button type="button" class="remove-tag-btn">&times;</button>`;
                    customTagsContainer.appendChild(tag);
                }
                hasSymptoms = true;
            }
        });
        
        // --- Populate Severity ---
        const sevSect = document.getElementById('severity-section');
        if (hasSymptoms) {
            sevSect.classList.remove('hidden');
            document.getElementById('log-severity-value').value = entry.severity;
            document.querySelectorAll('#log-severity .severity-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.value == entry.severity);
            });
        } else {
            sevSect.classList.add('hidden');
        }

        // --- Update UI ---
        // We now update the new modal's elements
        logModalTitle.textContent = 'Edit Log Entry';
        logFormSubmitBtn.textContent = 'Save Changes';
    };

    // --- Listener for the Cancel Edit button (will be moved/re-created) ---
    /**
     * Shows the Log Entry modal.
     * @param {number | null} entryId - The ID of the entry to edit, or null for a new entry.
     */
    function showLogModal(entryId = null) {
        // 1. Set form context based on phase
        updateLogFormForPhase(appState.userProfile.currentPhase);
        
        if (entryId === null) {
            // --- NEW ENTRY ---
            appState.currentlyEditingId = null;
            resetLogForm(); // Clear any old data
            logModalTitle.textContent = 'Add Log Entry';
            logFormSubmitBtn.textContent = 'Add Entry';
        } else {
            // --- EDITING ENTRY ---
            const entryToEdit = appState.logEntries.find(entry => entry.id === entryId);
            if (entryToEdit) {
                appState.currentlyEditingId = entryId;
                populateFormForEdit(entryToEdit);
                // Note: populateFormForEdit already updates the modal title and button text
            } else {
                return; // Entry not found
            }
        }
        
        // 3. Show the modal
        logEntryModal.classList.remove('hidden');
    }

    /**
     * Closes and resets the Log Entry modal.
     */
    function closeLogModal() {
        logEntryModal.classList.add('hidden');
        resetLogForm(); // Always reset the form on close
        appState.currentlyEditingId = null; // Clear editing state
        hideAutocomplete(); // NEW: Hide autocomplete
    }

    const handleAIQuery = (prompt, title, imageData = null, mimeType = null) => {
         // Prepend language instruction to prompt
         const currentLang = i18next.language;
         prompt = `(Respond in ${currentLang} language) ` + prompt;
         aiResultsLoader.classList.remove('hidden'); aiResultsContainer.classList.add('hidden'); aiResultsContent.innerHTML = '';
         callGeminiAPI(prompt, imageData, mimeType)
            .then(response => {
                if (response) { 
                    const profileHTML = getProfileForDisplay();
                    const disclaimer = `Disclaimer: I am a FODMAP expert analysis tool, not a medical professional. This information is for educational purposes regarding dietary management only and is not a substitute for personalized medical advice or treatment. Always consult with your doctor or a registered dietitian before making dietary changes.`;

                    // 1. Process the AI response
                    let aiContent = response
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')   // Bold
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italics
                        .replace(/\n/g, '<br>'); // Newlines

                    // 2. Build the full response with header and footer
                    let html = `
                        <div class="space-y-3">
                            <div>
                                <p><strong>Food:</strong> ${title}</p>
                                ${profileHTML ? `<p>${profileHTML}</p>` : ''}
                            </div>
                            
                            <hr class="border-slate-200">
                            
                            <div>${aiContent}</div>

                            <hr class="border-slate-200">
                            
                            <p class="text-xs text-subtle italic">${disclaimer}</p>
                        </div>
                    `;
                    
                    aiResultsContent.innerHTML = html; 
                    aiResultsContainer.classList.remove('hidden'); 

                    // --- NEW: Check for rating (Count is handled by Backend now) ---
                    checkAndShowRatePopup();
                    // --- END NEW ---
                }                    
                else { 
                    // --- NEW: Handle specific failure states ---
                    const profile = appState.userProfile;
                    const limit = 5;
                    const used = profile.aiUsageCount || 0;

                    if (!profile.isPremium && used >= limit) {
                        // Case 1: Limit Reached (Show "Locked" Teaser)
                        aiResultsContent.innerHTML = `
                            <div class="flex flex-col items-center justify-center py-6 text-center">
                                <div class="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-3">
                                     <i class="fas fa-lock text-amber-600 text-xl"></i>
                                </div>
                                <h3 class="font-bold text-secondary">Limit Reached</h3>
                                <p class="text-xs text-subtle mt-1 max-w-[200px] mx-auto">Upgrade to Premium to unlock unlimited AI analysis.</p>
                            </div>
                        `;
                    } else {
                        // Case 2: Actual Technical Error
                        aiResultsContent.innerHTML = `
                            <div class="text-center py-4">
                                <p class="text-error font-semibold flex items-center justify-center gap-2">
                                    <i class="fas fa-exclamation-circle"></i> Analysis Failed
                                </p>
                                <p class="text-xs text-subtle mt-1">Please check your connection or try again.</p>
                            </div>
                        `;
                    }
                    aiResultsContainer.classList.remove('hidden'); 
                }
            }).finally(() => {
                aiResultsLoader.classList.add('hidden');
                // Clear inputs after search
                aiFoodSearchInput.value = '';
                appState.stagedImageData = null;
                stagedImageContainer.classList.add('hidden');
            });
    };

    aiSendBtn.addEventListener('click', () => {
        const foodName = aiFoodSearchInput.value.trim();
        
        // Check if we have an image or text
        if (!appState.stagedImageData && !foodName) {
            showToast("Please enter food or upload an image.", "warning");
            return;
        }

        let prompt;
        let title;

        if (appState.stagedImageData) {
            // We are searching with an image
            title = `Image${foodName ? ` (${foodName})` : ''}`; // Use text as a caption if it exists
            prompt = `FODMAP expert. Analyze image ingredients. ${buildProfileContext()}
            ${foodName ? `User text: "${foodName}".` : ''}
            List ingredients.
            For high-FODMAP items, *briefly explain why*.
            **Overall Summary:** (Safe or Not Safe).

            Format: **bold** headings, *italics*, newlines, emojis.
            No tables, '###', '---', or '|'. No disclaimer.`;
            
            handleAIQuery(prompt, title, appState.stagedImageData, appState.stagedImageMimeType);

        } else if (foodName) {
            // We are searching with text only
            title = foodName;
            prompt = `FODMAP expert: Analyze '${foodName}'. ${buildProfileContext()}
            Use this exact template:
            **FODMAP Level:** [Brief level & why. Use *italics* or emojis. No bold sentences.]
            **Safe Portion:** [Brief portion size. Use *italics* or emojis.]
            **Substitutes:** [List 3-4. Use *italics* or emojis.]

            No tables, '###', '---', or '|'. No disclaimer.`;
            
            handleAIQuery(prompt, title, null, null);
        }
    });

    // Add text input "Enter" key listener
    aiFoodSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aiSendBtn.click(); // Trigger the send button click
        }
    });

    // --- New AI Chat Bar Listeners ---
    aiAttachBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop click from bubbling to the window
        aiAttachPopup.classList.toggle('open');
    });

    popupGalleryBtn.addEventListener('click', () => {
        imageUploadInput.click();
    });

    popupCameraBtn.addEventListener('click', () => {
        cameraUploadInput.click();
    });

    clearStagedImageBtn.addEventListener('click', () => {
        appState.stagedImageData = null;
        appState.stagedImageMimeType = null;
        stagedImageContainer.classList.add('hidden');
        imagePreview.src = '';
    });

    const handleFileSelect = (event) => {
        const file = event.target.files[0]; if (!file) return; 
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target.result;
            // 1. Get the base64 data and MIME type
            appState.stagedImageData = result.split(',')[1]; 
            appState.stagedImageMimeType = result.split(';')[0].split(':')[1]; // <--- EXTRACT MIME TYPE

            // 2. Show the preview
            imagePreview.src = result;
            uploadPromptText.textContent = file.name;
            stagedImageContainer.classList.remove('hidden');

            // 3. Close the popup
            aiAttachPopup.classList.remove('open');
        }; 
        reader.readAsDataURL(file); 
        event.target.value = null; 
    };
    
    imageUploadInput.addEventListener('change', handleFileSelect);
    cameraUploadInput.addEventListener('change', handleFileSelect);

    const summaryContainer = document.getElementById('progress-summary');
    const homePageContainer = document.getElementById('home');
    const renderHomePage = () => {
        summaryContainer.innerHTML = '';
        let itemsAdded = 0; 

    // --- NEW: Apply saved accordion state ---
    const progressCardEl = document.getElementById('home-progress-card');
    if (progressCardEl) {
        progressCardEl.classList.toggle('expanded', appState.userProfile.uiSettings.isProgressExpanded);
    }

        FODMAP_GROUP_DATA.forEach(groupData => {
            // NEW: Skip non-challenge groups in this view
            if (groupData.value === "Restriction" || groupData.value === "Other" || groupData.value === "Safe Meal") {
                return; // Skip this group
            }
            const entries = appState.logEntries.filter(entry => entry.group === groupData.value); 
            const count = entries.length;
            
            if (count > 0) {
                itemsAdded++; 
                let statusText, icon, color;
                
                if (count >= 3) { 
                    statusText = `Completed (${count})`; 
                    icon = "fa-check-circle"; 
                    color = "text-accent"; 
                } else { 
                    statusText = `In Progress (${count})`; 
                    icon = "fa-spinner fa-spin"; 
                    color = "text-warning"; 
                }
                const style = FODMAP_STYLES[groupData.value] || { icon: '❓' };
                const item = document.createElement('div'); 
                item.className = 'progress-item bg-slate-100 rounded-lg transition-colors duration-300'; 
                item.dataset.group = groupData.value;
                
                // --- UPDATED INNERHTML for symptoms array ---
                item.innerHTML = `<div class="progress-item-header flex items-center justify-between p-3 cursor-pointer hover:bg-slate-200 rounded-lg"><div class="flex items-center gap-2"><i class="fas fa-chevron-right expand-icon text-slate-400 transition-transform duration-300 text-xs"></i><div><p class="font-semibold text-secondary text-sm"><span class="mr-1">${style.icon}</span>${groupData.name}</p><p class="text-xs text-subtle">${groupData.examples.slice(1, -1)}</p></div></div><div class="flex items-center gap-1.5 ${color}"><i class="fas ${icon} text-xs"></i><span class="text-xs font-medium">${statusText}</span></div></div><div class="progress-item-body border-t border-slate-200">${ entries.length > 0 ? entries.sort((a,b) => new Date(a.date) - new Date(b.date)).map(e => { 
                    // --- START: UPDATED LOGIC ---
                    const symptoms = e.symptoms || ['None']; 
                    const hasSymptoms = !symptoms.includes('None') && symptoms.length > 0;
                    let symptomDisplay;

                    if (hasSymptoms) {
                        symptomDisplay = `${symptoms.join(', ')} (${e.severity}/5)`; // Added parentheses
                    } else {
                        symptomDisplay = 'No symptoms'; // Lowercase 's'
                    }
                    
                    // Format date as "Oct 31, 25"
                    const formattedDate = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    // Return the new format
                    return `<p><strong>${formattedDate}:</strong> ${e.food}, ${e.dose} - <em>${symptomDisplay}</em></p>`
                    // --- END: UPDATED LOGIC ---
                }).join('') : '<p class="text-subtle italic p-3 text-xs">No entries.</p>' }</div>`;
                summaryContainer.appendChild(item);
            }
        });

        if (itemsAdded === 0) {
            summaryContainer.innerHTML = `<p class="text-center text-subtle italic text-sm p-4">Your progress will show here once you add your first log entry!</p>`;
        }

        try {
            renderSymptomChart();
        } catch (e) {
            console.error("Failed to render symptom chart (this is expected if offline and not cached):", e);
            // Don't let a chart error stop the app
        }
    };
    summaryContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.progress-item-header'); if (header) { const item = header.parentElement; const expanded = item.classList.contains('expanded'); summaryContainer.querySelectorAll('.progress-item').forEach(i => i.classList.remove('expanded')); if (!expanded) item.classList.add('expanded'); }
        });
        homePageContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-header');
        if (header) {
            const group = header.parentElement;
            if (group.classList.contains('accordion-group')) {
                // Toggle the class
                const isNowExpanded = group.classList.toggle('expanded');

                // --- NEW: Save the state ---
                if (group.id === 'home-progress-card') {
                    appState.userProfile.uiSettings.isProgressExpanded = isNowExpanded;
                    localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                    saveToCloud('userProfile', appState.userProfile);
                }
                // --- END ---
            }
        }
    });

    // --- NEW COUNTDOWN RENDERER ---
    function renderCountdown(phase) {
        // --- Get phase-specific settings ---
        const settings = appState.userProfile.phaseSettings[phase];
        
        // --- Get NEW DOM elements ---
        const textContainer = document.getElementById(`home-${phase}-countdown-text`);
        const progressContainer = document.getElementById(`home-${phase}-progress-container`);
        const progressBar = document.getElementById(`home-${phase}-progress-bar`);
        const progressText = document.getElementById(`home-${phase}-progress-text`); // New text element

        if (!textContainer || !progressContainer || !progressBar || !progressText) {
            // This check will now fail for 'pre-treatment' until you update its HTML
            console.error(`Countdown render failed for ${phase}, elements missing.`);
            return;
        }

        if (!settings || !settings.startDate) {
            textContainer.innerHTML = `<span class="text-sm text-subtle">Set your <strong>Phase Start Date</strong> in your Profile to begin the countdown.</span>`;
            progressContainer.classList.add('hidden'); // Hide bar
            return;
        }

        // --- Calculate totalDays based on unit ---
        let totalDays = 0;
        const num = settings.durationNum;
        const unit = settings.durationUnit;

        if (unit === 'days') {
            totalDays = num;
        } else if (unit === 'weeks') {
            totalDays = num * 7;
        } else if (unit === 'months') {
            totalDays = num * 30; // Approximation
        }

        if (totalDays <= 0) { // Avoid division by zero
            progressContainer.classList.add('hidden');
            textContainer.innerHTML = `<span class="text-sm text-subtle">Please set a duration greater than 0 in your Profile.</span>`;
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today
        const start = new Date(settings.startDate + 'T00:00:00'); // Assume local timezone
        
        // --- Format Start Date ---
        const formattedStartDate = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        // Calculate days elapsed (ensuring it's at least 0)
        const timeDiff = today.getTime() - start.getTime();
        const daysElapsed = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1); // +1 because day 1 is elapsed
        
        const daysRemaining = Math.max(0, totalDays - daysElapsed);
        const percentComplete = Math.max(0, Math.min(100, (daysElapsed / totalDays) * 100));

        // --- Calculate duration display ---
        let durationDisplay = `${settings.durationNum} ${settings.durationUnit}`;
        let currentUnitNum = 0;

        if (settings.durationUnit === 'weeks') {
            currentUnitNum = Math.min(settings.durationNum, Math.floor((daysElapsed - 1) / 7) + 1);
            durationDisplay = `Week ${currentUnitNum} of ${settings.durationNum}`;
        } else if (settings.durationUnit === 'days') {
            currentUnitNum = Math.min(settings.durationNum, daysElapsed);
            durationDisplay = `Day ${currentUnitNum} of ${settings.durationNum}`;
        } else if (settings.durationUnit === 'months') {
            currentUnitNum = Math.min(settings.durationNum, Math.floor((daysElapsed - 1) / 30) + 1); // Approx
            durationDisplay = `Month ${currentUnitNum} of ${settings.durationNum}`;
        }

        // --- Render the components ---
        progressContainer.classList.remove('hidden'); // Show bar
        progressBar.style.width = `${percentComplete}%`;
        
        // --- NEW: Set Percentage Text ---
        // Only show text if the bar is wide enough
        if (percentComplete > 10) { 
            progressText.textContent = `${Math.floor(percentComplete)}%`;
        } else {
            progressText.textContent = '';
        }

        if (daysRemaining > 0) {
            textContainer.innerHTML = `
                <div class="font-bold text-lg text-primary">${durationDisplay}</div>
                <div class="text-sm text-muted">${daysRemaining} days remaining</div>
                <div class="text-xs text-subtle mt-1">Starting date: ${formattedStartDate}</div>
            `;
        } else {
            // --- FIX: Show bar and set to 100% on complete ---
            progressContainer.classList.remove('hidden');
            progressBar.style.width = `100%`;
            progressText.textContent = `100%`; // Show 100% on complete
            textContainer.innerHTML = `
                <div class="font-bold text-lg text-accent">Phase Complete! 🎉</div>
                <div class="text-sm text-muted">Congratulations!</div>
                <div class="text-xs text-subtle mt-1">Starting date: ${formattedStartDate}</div>
            `;
        }
    }

    // --- NEW: Renders the pre-treatment rules card on the Home page ---
    function renderPreTreatmentCard() {
        const rulesList = document.getElementById('home-pretreatment-rules-list');
        if (!rulesList) return;

        const rulesString = appState.userProfile.phaseSettings["pre-treatment"].rules;
        
        if (!rulesString || rulesString.trim() === '') {
            rulesList.innerHTML = `<li class="list-none text-subtle italic">No rules set. Add them in your Profile.</li>`;
            return;
        }

        const rulesArray = rulesString.split('\n');
        rulesList.innerHTML = rulesArray
            .filter(line => line.trim() !== '') // Remove empty lines
            .map(line => `<li>${line}</li>`) // Render each line as a list item
            .join('');
    }

    // --- NEW: Auto-Scan now triggers a modal ---
    function runAutoScan() {
        showActionModal({
            title: 'Auto-Scan Log',
            message: `How do you want to scan? "Merge" adds new foods and updates existing ones from your log. "Erase" deletes your list and starts over with only what's in your log.`,
            confirmText: 'Merge', // The safe, default option
            onConfirm: () => {
                performScan(true); // true = isMerging
            },
            altText: 'Erase', // The destructive option
            onAltConfirm: () => {
                performScan(false); // false = !isMerging
            }
        });
    }

    /**
     * Performs the scan logic, either merging or erasing.
     * @param {boolean} isMerging - If true, merges with existing list. If false, erases.
     */
    async function performScan(isMerging) {
        const newFoodsArray = [];
        const allFoodsByName = {}; // { milk: [...], apple: [...] }
        let foodIdCounter = Date.now(); // Used for *new* foods

        // 1. Group all log entries by food name
        appState.logEntries.forEach(entry => {
            if (!entry.group) return; // Only skip entries with no group

            const foodName = entry.food.trim().toLowerCase();
            if (!allFoodsByName[foodName]) {
                allFoodsByName[foodName] = [];
            }
            allFoodsByName[foodName].push(entry);
        });

        // 2. Process each unique food
        for (const foodName in allFoodsByName) {
            const entries = allFoodsByName[foodName];
            const mostRecentEntry = entries.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const group = mostRecentEntry.group; 

            const allTolerated = entries.every(e => !hasSymptoms(e));
            const triggerEntries = entries.filter(e => hasSymptoms(e));
            const severeTriggerEntries = triggerEntries.filter(e => parseInt(e.severity, 10) >= 4);

            let newFoodObject = {
                // id: foodIdCounter++, // ID will be assigned later
                name: foodName.charAt(0).toUpperCase() + foodName.slice(1), 
                group: group,
                status: 'tolerated', 
                doseLogic: null,
                dose: '',
                notes: ''
            };

            if (allTolerated) {
                newFoodObject.notes = "All logged portions tolerated.";
            } else if (severeTriggerEntries.length > 0) {
                const latestSevereTrigger = severeTriggerEntries.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                newFoodObject.status = 'trigger';
                newFoodObject.doseLogic = null; 
                newFoodObject.dose = '';
                newFoodObject.notes = `Severe trigger (Severity: ${latestSevereTrigger.severity}/5) at ${latestSevereTrigger.dose}.`;
            } else if (triggerEntries.length > 0) {
                const latestMildTrigger = triggerEntries.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                newFoodObject.status = 'trigger'; 
                newFoodObject.doseLogic = 'starting at'; 
                newFoodObject.dose = latestMildTrigger.dose;
                newFoodObject.notes = `Mild symptoms (Severity: ${latestMildTrigger.severity}/5) at this dose.`;
            }
            
            newFoodsArray.push(newFoodObject);
        }

        // --- 3. Handle Merging vs. Erasing (Cloud Batch Write) ---
        const user = auth ? auth.currentUser : null;
        if (!user) {
            // User is a guest (or offline). Perform the logic on the *local* appState array.
            let existingFoods = [...appState.userProfile.personalizationFoods];
            let newFoodsAdded = 0;
            let foodsUpdated = 0;

            newFoodsArray.forEach(scannedFood => {
                const existingIndex = existingFoods.findIndex(f => f.name.toLowerCase() === scannedFood.name.toLowerCase());

                if (existingIndex > -1) {
                    // Food exists: Update it, preserve original ID
                    const originalId = existingFoods[existingIndex].id;
                    existingFoods[existingIndex] = { ...scannedFood, id: originalId };
                    foodsUpdated++;
                } else {
                    // Food is new: Add it with a new ID
                    existingFoods.push({ ...scannedFood, id: foodIdCounter++ });
                    newFoodsAdded++;
                }
            });
            
            appState.userProfile.personalizationFoods = existingFoods;
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            renderPersonalizationSummary(); 
            showToast(`Scan complete! ${newFoodsAdded} foods added, ${foodsUpdated} updated.`, "success");
            return; // Exit, no cloud operations
        }

        // --- User is LOGGED IN: Perform cloud operations ---
        const batch = db.batch();
        const dietColRef = db.collection('users').doc(user.uid).collection('diet');
        let newFoodsAdded = 0;
        let foodsUpdated = 0;
        let finalFoodCount = 0;
        
        // We still use the local array as the "source of truth" to compare against
        let existingFoods = [...appState.userProfile.personalizationFoods];
        let finalLocalFoods = []; // This will become the new local state

        try {
            if (isMerging) {
                // --- MERGE LOGIC (Cloud) ---
                newFoodsArray.forEach(scannedFood => {
                    const existingFood = existingFoods.find(f => f.name.toLowerCase() === scannedFood.name.toLowerCase());
                    
                    if (existingFood) {
                        // Food exists: Update it in the batch, preserve ID
                        const docRef = dietColRef.doc(String(existingFood.id));
                        batch.set(docRef, { ...scannedFood, id: existingFood.id }); // Use .set to overwrite
                        finalLocalFoods.push({ ...scannedFood, id: existingFood.id });
                        foodsUpdated++;
                    } else {
                        // Food is new: Add it with a new ID
                        const newId = foodIdCounter++;
                        const docRef = dietColRef.doc(String(newId));
                        batch.set(docRef, { ...scannedFood, id: newId });
                        finalLocalFoods.push({ ...scannedFood, id: newId });
                        newFoodsAdded++;
                    }
                });
                
                // Add back any existing foods that *weren't* part of the scan
                existingFoods.forEach(ef => {
                    if (!finalLocalFoods.some(f => f.id === ef.id)) {
                        finalLocalFoods.push(ef);
                    }
                });

                finalFoodCount = finalLocalFoods.length;
                
            } else {
                // --- ERASE LOGIC (Cloud) ---
                // 1. Delete all existing documents
                // We must do this *before* committing the batch
                // This is safer to do as a separate operation first
                const existingDocs = await dietColRef.get();
                if (!existingDocs.empty) {
                    const deleteBatch = db.batch();
                    existingDocs.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }

                // 2. Add new documents
                newFoodsArray.forEach(scannedFood => {
                    const newId = foodIdCounter++;
                    const docRef = dietColRef.doc(String(newId));
                    batch.set(docRef, { ...scannedFood, id: newId });
                    finalLocalFoods.push({ ...scannedFood, id: newId });
                });
                finalFoodCount = finalLocalFoods.length;
            }

            // Commit the batch of adds/updates
            await batch.commit();
            
            // 4. Update local state & re-render
            appState.userProfile.personalizationFoods = finalLocalFoods;
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            saveToCloud('userProfile', appState.userProfile); // Save other profile settings
            renderPersonalizationSummary(); 
            
            if (isMerging) {
                showToast(`Scan complete! ${newFoodsAdded} foods added, ${foodsUpdated} updated.`, "success");
            } else {
                showToast(`Scan complete! Found ${finalFoodCount} unique foods.`, "success");
            }

        } catch (e) {
            console.error("AutoScan batch write failed:", e);
            showToast("AutoScan failed to sync with cloud.", "error");
        }
    }

    // --- NEW: Main Controller for Personalization Home Tab ---
    function renderPersonalizationSummary() {
        const groupView = document.getElementById('personalization-group-view');
        const toleranceView = document.getElementById('personalization-tolerance-view');
        if (!groupView || !toleranceView) return;
        
        // --- NEW: Get search filter text ---
        const filterText = document.getElementById('p13n-search-input').value.toLowerCase().trim();

        // --- THIS IS THE FIX ---
        // Sync the active state of the buttons with the appState
        const isGroupView = (appState.currentPersonalizationView === 'group');
        document.getElementById('p13n-view-group-btn').classList.toggle('active', isGroupView);
        document.getElementById('p13n-view-tolerance-btn').classList.toggle('active', !isGroupView);
        // --- END FIX ---

        if (isGroupView) {
            groupView.classList.remove('hidden');
            toleranceView.classList.add('hidden');
            renderPersonalizationByGroup(filterText); // Pass filter
        } else {
            groupView.classList.add('hidden');
            toleranceView.classList.remove('hidden');
            renderPersonalizationByTolerance(filterText); // Pass filter
        }
    }

    // --- Renders Personalization Home Tab (GROUP VIEW) ---
    function renderPersonalizationByGroup(filterText = '') {
        const container = document.getElementById('personalization-group-view');
        if (!container) return;

        container.innerHTML = ''; // Clear old content
        const foods = appState.userProfile.personalizationFoods.filter(food => 
            food.name.toLowerCase().includes(filterText)
        );
        const groups = {}; // { Lactose: [], Fructose: [] }

        // 1. Group all foods
        foods.forEach(food => {
            if (!groups[food.group]) {
                groups[food.group] = [];
            }
            groups[food.group].push(food);
        });

        // 2. Render each group accordion
        let groupsRendered = 0;
        FODMAP_GROUP_DATA.forEach(groupData => {
            if (groupData.value === "Restriction") return;
            
            const groupName = groupData.value;
            const foodsInGroup = groups[groupName] || [];
            
            if (foodsInGroup.length > 0) {
                groupsRendered++;
                const style = FODMAP_STYLES[groupName] || { icon: '❓' };
                const groupDiv = document.createElement('div');
                groupDiv.className = 'accordion-group';
                groupDiv.style.backgroundColor = '#fff';

                const header = document.createElement('div');
                header.className = 'accordion-header p13n-home-item-header';
                header.innerHTML = `
                    <h3 class="flex items-center gap-2">${style.icon} ${groupData.name}</h3>
                    <div class="flex items-center gap-1.5 status-text text-muted">
                        ${foodsInGroup.length} food(s)
                    </div>
                `;
                
                const body = document.createElement('div');
                body.className = 'accordion-body';
                body.innerHTML = `<div class="p13n-food-list">
                    ${foodsInGroup.map(food => renderFoodLink(food)).join('')}
                </div>`;
                
                groupDiv.appendChild(header);
                groupDiv.appendChild(body);
                container.appendChild(groupDiv);
            }
        });

        if (groupsRendered === 0) {
            if (filterText) {
                container.innerHTML = `<p class="text-subtle text-sm text-center p-4">No foods found matching "${filterText}".</p>`;
            } else {
                container.innerHTML = `<p class="text-subtle text-sm text-center p-4">Your diet list is empty. Use the Auto-Scan or Add button to start.</p>`;
            }
        }
    }

    // --- Renders Personalization Home Tab (TOLERANCE VIEW) ---
    function renderPersonalizationByTolerance(filterText = '') {
        const container = document.getElementById('personalization-tolerance-view');
        if (!container) return;

        const foods = appState.userProfile.personalizationFoods.filter(food => 
            food.name.toLowerCase().includes(filterText)
        );
        const toleratedFoods = [];
        const triggerFoods = [];
        const mixedFoods = [];

        foods.forEach(food => {
            const status = getFoodStatus(food); // Use our new helper
            if (status === 'tolerated') toleratedFoods.push(food);
            else if (status === 'trigger') triggerFoods.push(food);
            else mixedFoods.push(food);
        });

        container.innerHTML = ''; // Clear container

        const emptyText = filterText 
            ? `No foods found matching "${filterText}".` 
            : 'No foods in this category yet.';

        // 1. Create "Tolerated" Accordion
        container.appendChild(createToleranceAccordion(
            'Tolerated Foods', 'fa-check-circle text-accent',
            toleratedFoods, 
            filterText ? emptyText : 'No tolerated foods added yet.'
        ));
        
        // 2. Create "Mixed" Accordion
        container.appendChild(createToleranceAccordion(
            'Mixed Tolerance', 'fa-circle-half-stroke text-warning',
            mixedFoods, 
            filterText ? emptyText : 'No dose-dependent foods added yet.'
        ));
        
        // 3. Create "Triggers" Accordion
        container.appendChild(createToleranceAccordion(
            'Potential Triggers', 'fa-exclamation-triangle text-error',
            triggerFoods, 
            filterText ? emptyText : 'No triggers identified yet. Great news!'
        ));
    }

    // --- NEW: Helper to get a food's true status ---
    function getFoodStatus(food) {
        if (food.doseLogic) return 'mixed';
        return food.status; // 'tolerated' or 'trigger'
    }

    // --- NEW: Helper to render a food link ---
    function renderFoodLink(food) {
        const status = getFoodStatus(food);
        let doseNote = '';
        if (status === 'mixed') {
            const logic = food.doseLogic === 'up to' ? 'Up to' : 'Starting at';
            doseNote = `<span class="dose-note">(${logic} ${food.dose})</span>`;
        }
        return `<a class="p13n-food-link ${status}" data-food-id="${food.id}">${food.name}${doseNote}</a>`;
    }

    // --- NEW: Helper to build the Tolerance accordions ---
    function createToleranceAccordion(title, icon, foods, emptyText) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'accordion-group expanded'; // Default expanded
        groupDiv.style.backgroundColor = '#fff';
        
        const header = document.createElement('div');
        header.className = 'accordion-header p13n-home-item-header';
        header.innerHTML = `
            <h3 class="flex items-center gap-2"><i class="fas ${icon}"></i> ${title}</h3>
            <div class="flex items-center gap-1.5 status-text text-muted">
                ${foods.length}
            </div>
        `;
        
        const body = document.createElement('div');
        body.className = 'accordion-body';
        if (foods.length > 0) {
            body.innerHTML = `<div class="p13n-food-list">
                ${foods.sort((a,b) => a.name.localeCompare(b.name)).map(food => renderFoodLink(food)).join('')}
            </div>`;
        } else {
            body.innerHTML = `<p class="p-3 text-xs text-subtle italic text-center">${emptyText}</p>`;
        }
        
        groupDiv.appendChild(header);
        groupDiv.appendChild(body);
        return groupDiv;
    }

    const logForm = document.getElementById('log-form');
    const logEntriesContainer = document.getElementById('log-entries');
    const logFilter = document.getElementById('log-filter');
    const symptomSelector = document.getElementById('log-symptom');
    const otherSymptomInput = document.getElementById('log-symptom-other');

    const setupLogForm = () => {
        // --- NEW: Custom Select Dropdown Logic ---
        const fodmapSelectContainer = document.getElementById('custom-fodmap-select-container');
        const fodmapTrigger = document.getElementById('custom-fodmap-select-trigger');
        const fodmapTriggerText = document.getElementById('custom-fodmap-select-text');
        const fodmapOptions = document.getElementById('custom-fodmap-select-options');
        const fodmapHiddenInput = document.getElementById('log-fodmap-group');

        // Populate options list logic removed from here.
        // It is now handled by updateDynamicData() to ensure translation availability.

        // Toggle dropdown
        // 1. Build the list immediately (using defaults or translated data)
        const buildDropdown = () => {
            fodmapOptions.innerHTML = '';
            FODMAP_GROUP_DATA.forEach(group => {
                if (appState.userProfile.currentPhase === 'reintroduction' && (group.value === 'Safe Meal' || group.value === 'Other')) return;
                
                const option = document.createElement('li');
                option.className = 'custom-select-option';
                option.dataset.value = group.value;
                const style = FODMAP_STYLES[group.value] || { icon: '❓' };
                option.innerHTML = `
                    <div class="option-title">${style.icon} ${group.name}</div>
                    <div class="option-examples">${group.examples}</div>
                `;
                fodmapOptions.appendChild(option);
            });
        };
        buildDropdown(); // Run once on init

        // 2. Toggle dropdown on click
        fodmapTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // Rebuild if empty (safety)
            if (fodmapOptions.children.length === 0) buildDropdown();
            
            fodmapOptions.classList.toggle('open');
            fodmapTrigger.classList.toggle('open');
        });

        // Handle option selection
        fodmapOptions.addEventListener('click', (e) => {
            const option = e.target.closest('.custom-select-option');
            if (option) {
                fodmapHiddenInput.value = option.dataset.value; // Set hidden input
                fodmapTriggerText.textContent = option.querySelector('.option-title').textContent; // Set button text
                fodmapTrigger.classList.remove('placeholder'); // Remove placeholder styling
                fodmapOptions.classList.remove('open');
                fodmapTrigger.classList.remove('open');
            }
        });

        // --- NEW: Autocomplete Listeners for Food Input ---
        const logFoodInput = document.getElementById('log-food');
        let allFoodNames = []; // Cache for suggestions
        
        logFoodInput.addEventListener('focus', () => {
            // Get all names when the user first focuses
            allFoodNames = getUniqueFoodNames();
        });

        logFoodInput.addEventListener('input', () => {
            const query = logFoodInput.value.trim();
            const confirmBtn = document.getElementById('log-food-confirm-btn');

            if (query.length < 1) {
                hideAutocomplete(); // This hides both list and button
                return;
            }

            // Show confirm button whenever there is text
            if (confirmBtn) {
                confirmBtn.style.display = 'flex';
            }

            const matches = allFoodNames.filter(name => 
                name.toLowerCase().includes(query.toLowerCase())
            );
            
            showAutocomplete(matches, logFoodInput);
        });

        logFoodInput.addEventListener('blur', () => {
            // We use a short timeout to allow a click on a suggestion
            // to register before the list is hidden.
            setTimeout(hideAutocomplete, 200);
        });
        logFoodInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form from submitting
                
                // NEW: Trigger the confirm button if it's visible
                const confirmBtn = document.getElementById('log-food-confirm-btn');
                if (confirmBtn && confirmBtn.style.display !== 'none') {
                    confirmBtn.click(); // Programmatically click the button
                } else {
                    // Fallback: just move focus
                    hideAutocomplete();
                    document.getElementById('log-dose').focus();
                }
            }
        });

        // --- NEW: Confirm Button Click Listener ---
        const logFoodConfirmBtn = document.getElementById('log-food-confirm-btn');
        if (logFoodConfirmBtn) {
            logFoodConfirmBtn.addEventListener('click', () => {
                hideAutocomplete(); // Hide suggestions and the button itself
                document.getElementById('log-dose').focus(); // Move focus to Dose
            });
        }
        
        // --- Severity Button Setup (Unchanged) ---
        const sevCont = document.getElementById('log-severity'); 
        const sevSect = document.getElementById('severity-section'); 
        const sevInput = document.getElementById('log-severity-value');
        sevCont.innerHTML = ''; // Clear container
        for (let i = 1; i <= 5; i++) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'severity-btn';
            btn.textContent = i; btn.dataset.value = i;
            if (i === 1) { btn.classList.add('selected'); }
            sevCont.appendChild(btn);
        }
        sevCont.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.severity-btn');
            if (clickedButton) {
                sevCont.querySelectorAll('.severity-btn').forEach(btn => btn.classList.remove('selected'));
                clickedButton.classList.add('selected');
                sevInput.value = clickedButton.dataset.value;
            }
        });

        // --- NEW: Symptom Tag Setup ---
        const symptomTagsContainer = document.getElementById('symptom-tags-container');
        symptomTagsContainer.innerHTML = ''; // Clear container

        // Add a "None" tag first
        symptomTagsContainer.innerHTML += `<div class=inline-block><input type=checkbox id="symptom-None" value="None" name="symptoms" class="profile-checkbox hidden"><label for="symptom-None" class="cursor-pointer border rounded-full px-2.5 py-1.5 text-xs font-medium text-muted duration-200">None</label></div>`;

        // Add predefined symptom tags
        SYMPTOM_OPTIONS.forEach(symptom => {
            symptomTagsContainer.innerHTML += `<div class=inline-block><input type=checkbox id="symptom-${symptom}" value="${symptom}" name="symptoms" class="profile-checkbox hidden"><label for="symptom-${symptom}" class="cursor-pointer border rounded-full px-2.5 py-1.5 text-xs font-medium text-muted duration-200">${symptom}</label></div>`;
        });

        const customSymptomInput = document.getElementById('custom-symptom-input');
        const addCustomSymptomBtn = document.getElementById('add-custom-symptom-btn');
        const customSymptomTagsContainer = document.getElementById('custom-symptom-tags-container');
        const customSymptomTrigger = document.getElementById('custom-symptom-trigger');
        const customSymptomBody = document.getElementById('custom-symptom-body');

        const addCustomTag = () => {
            const symptom = toTitleCase(customSymptomInput.value.trim());
            if (symptom) {
                const tag = document.createElement('div');
                tag.className = 'custom-symptom-tag';
                tag.textContent = symptom;
                tag.innerHTML += `<button type="button" class="remove-tag-btn">&times;</button>`;
                customSymptomTagsContainer.appendChild(tag);
                customSymptomInput.value = '';
                updateSeverityVisibility();
            }
        };

        addCustomSymptomBtn.addEventListener('click', addCustomTag);
        customSymptomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
            }
        });

        customSymptomTrigger.addEventListener('click', () => {
            customSymptomBody.classList.toggle('hidden');
            // Automatically focus the input field when shown
            if (!customSymptomBody.classList.contains('hidden')) {
                customSymptomInput.focus();
            }
        });

        customSymptomTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag-btn')) {
                e.target.parentElement.remove();
                updateSeverityVisibility();
            }
        });

        const updateSeverityVisibility = () => {
            const hasPredefined = document.querySelectorAll('input[name="symptoms"]:checked').length > 0;
            const hasCustom = customSymptomTagsContainer.children.length > 0;
            const isNoneSelected = document.getElementById('symptom-None').checked;
            
            sevSect.classList.toggle('hidden', (!hasPredefined && !hasCustom) || isNoneSelected);
        };

        symptomTagsContainer.addEventListener('change', (e) => {
            const noneCheckbox = document.getElementById('symptom-None');
            // If "None" is checked, uncheck all others
            if (e.target.value === 'None' && e.target.checked) {
                document.querySelectorAll('input[name="symptoms"]:checked').forEach(cb => {
                    if (cb.value !== 'None') cb.checked = false;
                });
                // Clear custom tags
                customSymptomTagsContainer.innerHTML = '';
                customSymptomBody.classList.add('hidden'); // Also hide the custom input
            } 
            
            // If another tag is checked, uncheck "None"
            else if (e.target.value !== 'None' && e.target.checked) {
                noneCheckbox.checked = false;
            }
            updateSeverityVisibility();
        });
    };
    
    // --- Renders the "Group by FODMAP" view (Your old renderLogEntries function) ---
    const renderLogByGroup = () => {
        const accordionContainer = document.getElementById('log-accordion-container');
        accordionContainer.innerHTML = '';
        let groupsWithEntries = 0;

        FODMAP_GROUP_DATA.forEach(groupData => {
            const entriesForGroup = appState.logEntries
                .filter(entry => entry.group === groupData.value)
                .sort((a, b) => new Date(b.date) - new Date(a.date)); 

            if (entriesForGroup.length > 0) {
                groupsWithEntries++;
                const style = FODMAP_STYLES[groupData.value] || { icon: '❓' };
                const groupDiv = document.createElement('div');
                groupDiv.className = 'accordion-group';
                
                const header = document.createElement('div');
                header.className = 'accordion-header';
                header.innerHTML = `
                    <h3>${style.icon} ${groupData.name} (${entriesForGroup.length})</h3>
                    <i class="fas fa-chevron-down accordion-icon"></i>
                `;
                
                const body = document.createElement('div');
                body.className = 'accordion-body';
                
                entriesForGroup.forEach(entry => {
                    let symptomText;
                    let severityText = '';
                    let noteText = ''; 
                    const symptoms = entry.symptoms || ['None'];
                    const hasSymptoms = !symptoms.includes('None') && symptoms.length > 0;
                    if (hasSymptoms) {
                        symptomText = `Symptoms: <strong>${symptoms.join(', ')}</strong>`;
                        severityText = `<div>Severity: <strong>${entry.severity}/5</strong></div>`;
                    } else {
                        symptomText = 'Symptoms: <strong>None</strong>';
                    }
                    const trimmedNote = entry.notes ? entry.notes.trim() : '';
                    if (trimmedNote !== '' && trimmedNote.toLowerCase() !== 'no notes') {
                        noteText = `<div style="margin-top: 0.25rem;">Note: <em>${entry.notes.replace(/\n/g, '<br>')}</em></div>`;
                    }
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'accordion-entry';
                    entryDiv.innerHTML = `
                        <div class="entry-header flex justify-between items-start">
                            <p class="font-semibold text-secondary text-sm">${entry.food}, ${entry.dose}</p>
                            <span class="text-xs text-subtle flex-shrink-0 ml-2">${new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div class="flex justify-between items-end">
                            <div class="entry-details">
                                <div>${symptomText}</div>
                                ${severityText}
                                ${noteText}
                            </div>
                            <div class="entry-actions text-right flex-shrink-0 ml-2">
                                <button class="edit-entry-btn text-accent hover:text-accent-dark text-xs p-1 rounded" data-id="${entry.id}">
                                    <i class="fas fa-pen-to-square"></i>
                                </button>
                                <button class="delete-entry-btn text-error hover:text-error-dark text-xs p-1 rounded" data-id="${entry.id}">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                    body.appendChild(entryDiv);
                });
                groupDiv.appendChild(header);
                groupDiv.appendChild(body);
                accordionContainer.appendChild(groupDiv);
            }
        });
        if (groupsWithEntries === 0) {
            accordionContainer.innerHTML = `<p class="text-subtle text-center py-6 bg-white rounded-lg shadow-sm col-span-full text-sm">No log entries yet. Add one above!</p>`;
        }
    };

    // --- Renders the new "View by Date" timeline ---
    const renderLogByDate = () => {
        const dateContainer = document.getElementById('log-date-container');
        dateContainer.innerHTML = '';
        
        if (appState.logEntries.length === 0) {
            dateContainer.innerHTML = `<p class="text-subtle text-center py-6 bg-white rounded-lg shadow-sm col-span-full text-sm">No log entries yet. Add one above!</p>`;
            return;
        }

        // 1. Sort entries based on the global sort variable
        const sortedEntries = [...appState.logEntries].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return appState.currentDateSort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        let currentHeaderDate = null;
        const today = new Date().toLocaleDateString('en-CA');
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');

        // 2. Loop and build timeline
        sortedEntries.forEach(entry => {
            const entryDate = new Date(entry.date).toLocaleDateString('en-CA');
            
            // 3. Add date header if it's a new day
            if (entryDate !== currentHeaderDate) {
                let dateHeaderText = new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                if (entryDate === today) dateHeaderText = 'Today';
                else if (entryDate === yesterday) dateHeaderText = 'Yesterday';
                
                const headerDiv = document.createElement('div');
                headerDiv.className = 'timeline-date-header';
                headerDiv.textContent = dateHeaderText;
                dateContainer.appendChild(headerDiv);
                currentHeaderDate = entryDate;
            }

            // 4. Build the entry card (similar to accordion, but as a standalone card)
            const style = FODMAP_STYLES[entry.group] || { icon: '❓' };
            const groupInfo = FODMAP_GROUP_DATA.find(g => g.value === entry.group);
            const groupName = groupInfo ? groupInfo.name : entry.group;
            
            let symptomText;
            let severityText = '';
            let noteText = ''; 
            const symptoms = entry.symptoms || ['None'];
            const hasSymptoms = !symptoms.includes('None') && symptoms.length > 0;
            if (hasSymptoms) {
                symptomText = `Symptoms: <strong>${symptoms.join(', ')}</strong>`;
                severityText = `<div>Severity: <strong>${entry.severity}/5</strong></div>`;
            } else {
                symptomText = 'Symptoms: <strong>None</strong>';
            }
            const trimmedNote = entry.notes ? entry.notes.trim() : '';
            if (trimmedNote !== '' && trimmedNote.toLowerCase() !== 'no notes') {
                noteText = `<div style="margin-top: 0.25rem;">Note: <em>${entry.notes.replace(/\n/g, '<br>')}</em></div>`;
            }

            const entryDiv = document.createElement('div');
            entryDiv.className = 'timeline-entry-card'; // Use new card style
            entryDiv.innerHTML = `
                <div class="entry-header flex justify-between items-start">
                    <p class="font-semibold text-secondary text-sm">${entry.food}, ${entry.dose}</p>
                    <span class="text-xs font-semibold px-1.5 py-0.5 rounded-full ${style.color}">${style.icon} ${groupName.split(' ')[0]}</span>
                </div>
                <div class="flex justify-between items-end">
                    <div class="entry-details">
                        <div>${symptomText}</div>
                        ${severityText}
                        ${noteText}
                    </div>
                    <div class="entry-actions text-right flex-shrink-0 ml-2">
                        <button class="edit-entry-btn text-accent hover:text-accent-dark text-xs p-1 rounded" data-id="${entry.id}">
                            <i class="fas fa-pen-to-square"></i>
                        </button>
                        <button class="delete-entry-btn text-error hover:text-error-dark text-xs p-1 rounded" data-id="${entry.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
            dateContainer.appendChild(entryDiv);
        });
    };

    // --- This is the new MAIN render function ---
    // --- This is the new MAIN render function ---
    const renderLogEntries = () => {
        // Get containers and sync their visibility with the appState
        const groupContainer = document.getElementById('log-accordion-container');
        const dateContainer = document.getElementById('log-date-container');
        const logSortContainer = document.getElementById('log-sort-container');
        const logSubtitle = document.getElementById('log-subtitle');

        const isGroupView = (appState.currentLogView === 'group');

        groupContainer.classList.toggle('hidden', !isGroupView);
        dateContainer.classList.toggle('hidden', isGroupView);
        logSortContainer.classList.toggle('hidden', isGroupView); // Sort button only for date view

        if (isGroupView) {
            logSubtitle.textContent = 'Tap a group to see entries.';
            renderLogByGroup();
        } else {
            logSubtitle.textContent = 'Showing all entries by date.';
            renderLogByDate();
        }
    };

    // --- Reusable Log Click Handler for Edit/Delete/Expand ---
    const handleLogClick = (e) => {
        const header = e.target.closest('.accordion-header');
        const deleteBtn = e.target.closest('.delete-entry-btn');
        const editBtn = e.target.closest('.edit-entry-btn');

        if (editBtn) {
            // --- HANDLE EDIT ---
            const entryId = parseInt(editBtn.dataset.id);
            showLogModal(entryId); // Open the modal in edit mode
        } else if (deleteBtn) {
            // --- HANDLE DELETE ---
            const entryId = parseInt(deleteBtn.dataset.id);
            
            // 1. Delete from local state
            appState.logEntries = appState.logEntries.filter(entry => entry.id !== entryId);
            
            // 2. Delete from cloud
            deleteLogFromCloud(entryId); // Async

            // 3. Save local state & re-render
            saveLogEntries();
            showToast("Entry deleted.", "success");

        } else if (header) {
            // --- HANDLE EXPAND ---
            header.parentElement.classList.toggle('expanded');
        }
    };

    // Attach listener to both containers
    document.getElementById('log-accordion-container').addEventListener('click', handleLogClick);
    document.getElementById('log-date-container').addEventListener('click', handleLogClick);
  
    // --- AI Shortcut Button on Home Page ---
    const aiShortcutBtn = document.getElementById('home-ai-shortcut-btn');
    if (aiShortcutBtn) {
        aiShortcutBtn.addEventListener('click', () => {
            navigateTo('food-info');
        });
    }
    
    // --- New View Toggle Listeners ---
    const logViewToggleBtns = document.querySelectorAll('.log-view-toggle .log-view-toggle-btn');
    const logSortBtn = document.getElementById('log-sort-btn');
    // Set initial text for the sort button
    logSortBtn.innerHTML = `<i class="fas fa-arrow-down-wide-short"></i> <span class="text-sm ml-1">Sort: Newest</span>`;
    const logSubtitle = document.getElementById('log-subtitle');
    const groupContainer = document.getElementById('log-accordion-container');
    const dateContainer = document.getElementById('log-date-container');

    logViewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Set active button
            logViewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update state
            appState.currentLogView = btn.dataset.view;

            // Re-render the log (which now handles all visibility)
            renderLogEntries();
        });
    });

    logSortBtn.addEventListener('click', () => {
        // Flip the sort order
        appState.currentDateSort = (appState.currentDateSort === 'newest') ? 'oldest' : 'newest';
        
        // Update the icon and text
        logSortBtn.innerHTML = `<i class="fas ${appState.currentDateSort === 'newest' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-wide-short'}"></i>
        <span class="text-sm ml-1">Sort: ${appState.currentDateSort === 'newest' ? 'Newest' : 'Oldest'}</span>`;
        
        // Re-render the date list
        renderLogByDate();
    });

    const saveLogEntries = () => { 
        // 1. Save local copy for offline use
        localStorage.setItem('fodmapLogEntries', JSON.stringify(appState.logEntries)); 
        
        // 2. Re-render UI
        renderLogEntries(); 
        renderHomePage(); 
        
        // 3. Save USER PROFILE (in case AI count changed)
        // Note: The cloud save for the log entry itself
        // is now handled by the logForm submit listener.
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);
    };

    logForm.addEventListener('submit', (e) => {
        e.preventDefault(); 

        // --- NEW: Consistent Validation Block (Request 1 & 2) ---
        const currentPhase = appState.userProfile.currentPhase;
        const selectedGroup = document.getElementById('log-fodmap-group').value;
        const foodName = toTitleCase(document.getElementById('log-food').value.trim());
        const dose = document.getElementById('log-dose').value.trim();

        // Validation Order: Group (if reintro), Name, Dose
        if (currentPhase === 'reintroduction' && !selectedGroup) {
            // Use 'true' for isError, which will make the toast red.
            // This is now consistent with the other fields.
            showToast("Please select a FODMAP group.", "warning");
            return; 
        }
        if (!foodName) {
            showToast("Please enter a food name.", "warning");
            return;
        }
        if (!dose) {
            showToast("Please enter a dose.", "warning");
            return;
        }
        // --- END: Consistent Validation Block ---

        // --- NEW: Group Defaulting Logic ---
        // (This runs *after* validation, so we just process the inputs)
        let finalGroup = 'Safe Meal'; // Default
        if (currentPhase === 'reintroduction') {
            finalGroup = selectedGroup; // We already validated this isn't empty
        } else if (currentPhase === 'personalization' && selectedGroup) {
            finalGroup = selectedGroup; // Use selected group if one was chosen
        } 
        // If phase is Personalization and no group was selected, it stays "Safe Meal".
        // If phase is Pre/Restrict, it stays "Safe Meal".
        // This covers all rules.

        const sev = document.getElementById('log-severity-value');
        
        // Get predefined symptoms
        let selectedSymptoms = Array.from(document.querySelectorAll('input[name="symptoms"]:checked')).map(el => el.value);
        
        // Get custom symptoms
        const customSymptoms = Array.from(document.querySelectorAll('.custom-symptom-tag')).map(tag => tag.firstChild.textContent);
        
        // Combine lists
        let allSymptoms = [...selectedSymptoms, ...customSymptoms];

        // If "None" is selected or list is empty, just use "None"
        if (allSymptoms.includes('None') || allSymptoms.length === 0) {
            allSymptoms = ['None'];
        }

        const entryData = { 
            date: document.getElementById('log-date').value, 
            group: finalGroup, // Use our new, validated AND defaulted variable
            food: foodName, // Use the trimmed variable
            dose: dose, // Use the trimmed variable
            symptoms: allSymptoms, // Save the new array
            severity: allSymptoms.includes('None') ? '1' : sev.value, // Save severity, or 1 if "None"
            notes: document.getElementById('log-notes').value 
        };

        if (appState.currentlyEditingId) {
            // --- UPDATE EXISTING ENTRY ---
            const logIdToUpdate = appState.currentlyEditingId;
            const updatedLog = { ...entryData, id: logIdToUpdate }; // Keep original ID

            // 1. Update in local state
            const index = appState.logEntries.findIndex(entry => entry.id === logIdToUpdate);
            if (index !== -1) {
                appState.logEntries[index] = updatedLog;
            }
            
            // 2. Update in cloud
            updateLogInCloud(logIdToUpdate, updatedLog); // Async

            appState.currentlyEditingId = null; // Reset edit state
            showToast("Entry updated!", "success");

        } else {
            // --- ADD NEW ENTRY ---
            const newEntry = { ...entryData, id: Date.now() };

            // 1. Add to local state
            appState.logEntries.push(newEntry); 
            
            // 2. Add to cloud
            addLogToCloud(newEntry); // Async

            showToast("Added!", "success");
        }

        // 3. Save local state, re-render, and check for rating
        saveLogEntries(); 
        checkAndShowRatePopup();
        
        // --- NEW: Close the modal (which also resets the form) ---
        closeLogModal();
    });

    /**
     * Resets the entire log form to its default state.
     */
    function resetLogForm() {
        logForm.reset(); 
        
        // Reset state
        appState.currentlyEditingId = null;

        // Reset all form fields
        document.getElementById('log-date').valueAsDate = new Date(); 
        // Reset custom dropdown
        document.getElementById('custom-fodmap-select-text').textContent = 'Select FODMAP Group...';
        document.getElementById('custom-fodmap-select-trigger').classList.add('placeholder');
        document.getElementById('log-fodmap-group').value = '';

        document.getElementById('custom-symptom-tags-container').innerHTML = '';
        document.getElementById('custom-symptom-body').classList.add('hidden'); // Collapse the custom input
        document.querySelectorAll('input[name="symptoms"]').forEach(cb => cb.checked = false);
        document.getElementById('severity-section').classList.add('hidden'); 
        
        // Reset modal button texts
        logModalTitle.textContent = 'Add Log Entry';
        logFormSubmitBtn.textContent = 'Add Entry';
        
        // Reset severity button group
        document.getElementById('log-severity-value').value = '1';
        document.querySelectorAll('#log-severity .severity-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.value === '1');
        });
    }
    
    const profileForm = document.getElementById('profile-form');

    // Add click listener for the new API Key accordion
    profileForm.addEventListener('click', (e) => {
        const header = e.target.closest('.api-key-header');
        if (header) {
            header.parentElement.classList.toggle('expanded');
        }
    });

    // NEW listener for the phase buttons inside the side menu
    sideMdl.addEventListener('click', (e) => {
        const clickedButton = e.target.closest('#side-menu-phases .log-view-toggle-btn');

        if (clickedButton && !clickedButton.classList.contains('active')) {
            const newPhase = clickedButton.dataset.phase;
            
            // 1. Update state
            appState.userProfile.currentPhase = newPhase;
            
            // 2. Save to localStorage + cloud
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            saveToCloud('userProfile', appState.userProfile);

            // 3. Update button UI
            sideMdl.querySelectorAll('#side-menu-phases .log-view-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            clickedButton.classList.add('active');
            
            // 4. Show toast
            const phaseName = newPhase.charAt(0).toUpperCase() + newPhase.slice(1);
            showToast(`Switched to ${phaseName} phase!`, newPhase);
            
            // 5. Update the rest of the app
            updateUiForPhase(newPhase);

            // 6. Close the menu
            closeSide();
        }
    });
    const createCheckbox = (id, val, name, checked) => `<div class=inline-block><input type=checkbox id=${id} value="${val}" name=${name} class="profile-checkbox hidden" ${checked?'checked':''}><label for=${id} class="cursor-pointer border border-slate-300 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted duration-200">${val}</label></div>`;

    const setupProfilePage = () => {
        document.getElementById('profile-diagnoses').innerHTML = PROFILE_OPTIONS.diagnoses.map(i => createCheckbox(`diag-${i}`, i, 'diagnoses', appState.userProfile.diagnoses.includes(i))).join('');
        document.getElementById('profile-intolerances').innerHTML = PROFILE_OPTIONS.intolerances.map(i => createCheckbox(`intol-${i}`, i, 'intolerances', appState.userProfile.intolerances.includes(i))).join('');
        document.getElementById('profile-preferences').innerHTML = PROFILE_OPTIONS.preferences.map(i => createCheckbox(`pref-${i}`, i, 'preferences', appState.userProfile.preferences.includes(i))).join('');
        document.getElementById('profile-allergies-other').value = appState.userProfile.allergiesOther || '';
    };

    profileForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        // --- 1. Save Basic Profile Info (All Phases) ---
        appState.userProfile.diagnoses = Array.from(document.querySelectorAll('input[name=diagnoses]:checked')).map(el => el.value); 
        appState.userProfile.intolerances = Array.from(document.querySelectorAll('input[name=intolerances]:checked')).map(el => el.value); 
        appState.userProfile.preferences = Array.from(document.querySelectorAll('input[name=preferences]:checked')).map(el => el.value); 
        appState.userProfile.allergiesOther = toTitleCase(document.getElementById('profile-allergies-other').value.trim());

        // --- 2. Phase-Specific Settings have been removed from this form ---
        // --- 3. Personalization Map logic REMOVED ---
        // (This will be handled by the new modal's save button later)

        // --- 4. Final Save to localStorage + cloud & Toast ---
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);
        showToast("Profile Saved!", "success");
    });

    // --- Payment / Premium Logic ---

    const initiateCheckout = async () => {
        if (!auth.currentUser) {
            // If guest, prompt to sign up first to attach the purchase
            showActionModal({
                title: 'Create Account Required',
                message: "To upgrade to a Lifetime Premium account securely, please create a free account or log in first.",
                confirmText: 'Log In / Sign Up',
                onConfirm: () => openAuthModal('signin'),
                cancelText: 'Cancel'
            });
            return;
        }

        const btn = document.getElementById('menu-premium-btn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Loading...';

        showToast("Preparing secure checkout...", "phase-reintroduction");

        try {
            const createSession = functions.httpsCallable('createCheckoutSession');
            // We pass the origin (e.g., http://127.0.0.1:5500) to ensure a clean redirect
            const { data } = await createSession({ 
                returnUrl: window.location.origin + window.location.pathname
            });
            
            if (data && data.url) {
                // Redirect to Stripe Hosted Page
                window.location.assign(data.url);
            } else {
                throw new Error("No payment URL returned.");
            }
        } catch (error) {
            console.error("Checkout failed:", error);
            showToast("Connection failed. Please try again.", "error");
            if (btn) btn.innerHTML = originalText;
        }
    };

    // Attach listeners to "Go Premium" buttons
    if (menuPremiumLi) {
        const btn = menuPremiumLi.querySelector('button');
        if (btn) {
            // Remove old listeners just in case
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openPremiumInfoModal();
            });
        }
    }

    const aiPremiumBtn = document.getElementById('ai-premium-btn');
    if (aiPremiumBtn) {
        // Clone to clear old listeners
        const newAiBtn = aiPremiumBtn.cloneNode(true);
        aiPremiumBtn.parentNode.replaceChild(newAiBtn, aiPremiumBtn);

        newAiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPremiumInfoModal();
        });
    }

    // --- Data Management Listeners ---
    const importFileInput = document.getElementById('import-file-input');
    const importDataBtn = document.getElementById('import-data-btn');
    const exportDataBtn = document.getElementById('export-data-btn');
    const resetAppBtn = document.getElementById('reset-app-btn');

    if (importDataBtn && importFileInput) {
        importDataBtn.addEventListener('click', () => {
            // --- NEW: Show confirmation modal FIRST ---
            showActionModal({
                title: 'Import Backup',
                message: "This will overwrite ALL current data (logs and profile) with the data from this file. This cannot be undone.",
                confirmText: 'Overwrite',
                onConfirm: () => {
                    importFileInput.click(); // Trigger the hidden file input
                }
            });
        });
        importFileInput.addEventListener('change', handleImportData);
    }

    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', handleExportData);
    }

    if (resetAppBtn) {
        resetAppBtn.addEventListener('click', handleResetApp);
    }

    // --- DEBUG: Testing Buttons ---
    const debugResetBtn = document.getElementById('debug-reset-count');
    const debugMaxBtn = document.getElementById('debug-max-count');

    if (debugResetBtn) {
        debugResetBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) { showToast("Not logged in", "error"); return; }
            
            debugResetBtn.disabled = true;
            db.collection('users').doc(user.uid).update({
                'userProfile.aiUsageCount': 0
            }).then(() => {
                showToast("✅ Counter Reset to 0", "success");
                debugResetBtn.disabled = false;
            }).catch(err => {
                console.error(err);
                showToast("Error resetting count", "error");
                debugResetBtn.disabled = false;
            });
        });
    }

    if (debugMaxBtn) {
        debugMaxBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) { showToast("Not logged in", "error"); return; }

            debugMaxBtn.disabled = true;
            db.collection('users').doc(user.uid).update({
                'userProfile.aiUsageCount': 5
            }).then(() => {
                showToast("✅ Set to Limit (5)", "warning");
                debugMaxBtn.disabled = false;
            }).catch(err => {
                console.error(err);
                showToast("Error setting limit", "error");
                debugMaxBtn.disabled = false;
            });
        });
    }

    // New Downgrade Button
    const debugDowngradeBtn = document.getElementById('debug-downgrade-btn');
    if (debugDowngradeBtn) {
        debugDowngradeBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) { showToast("Not logged in", "error"); return; }
            
            debugDowngradeBtn.disabled = true;
            debugDowngradeBtn.textContent = "...";

            try {
                // Manually set isPremium to false in Firestore
                await db.collection('users').doc(user.uid).set({
                    userProfile: { isPremium: false }
                }, { merge: true });

                showToast("⬇️ Downgraded to Free", "success");
                
                // Reload to refresh local state and UI
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (err) {
                console.error(err);
                showToast("Error downgrading", "error");
                debugDowngradeBtn.disabled = false;
                debugDowngradeBtn.textContent = "Revert to Free";
            }
        });
    }

    // --- END DEBUG Testing buttons ---

    // --- Personalization Tab Listeners (with null checks) ---
    
    // Add listeners for the personalization view toggle buttons
    const p13nGroupBtn = document.getElementById('p13n-view-group-btn');
    if (p13nGroupBtn) {
        p13nGroupBtn.addEventListener('click', () => {
            appState.currentPersonalizationView = 'group';
            document.getElementById('p13n-view-group-btn').classList.add('active');
            document.getElementById('p13n-view-tolerance-btn').classList.remove('active');
            renderPersonalizationSummary();
        });
    }

    const p13nToleranceBtn = document.getElementById('p13n-view-tolerance-btn');
    if (p13nToleranceBtn) {
        p13nToleranceBtn.addEventListener('click', () => {
            appState.currentPersonalizationView = 'tolerance';
            document.getElementById('p13n-view-group-btn').classList.remove('active');
            document.getElementById('p13n-view-tolerance-btn').classList.add('active');
            renderPersonalizationSummary();
        });
    }
    
    // Listeners for Personalization Action Buttons
    const p13nAutoscanBtn = document.getElementById('p13n-autoscan-btn');
    if (p13nAutoscanBtn) {
        p13nAutoscanBtn.addEventListener('click', runAutoScan);
    }
    
    const p13nAddFoodBtn = document.getElementById('p13n-add-food-btn');
    if (p13nAddFoodBtn) {
        p13nAddFoodBtn.addEventListener('click', () => {
            showFoodModal(null, true); // Open modal in NEW/EDIT mode
        });
    }

    // Add listener for personalization 'group' accordion
    const p13nGroupView = document.getElementById('personalization-group-view');
        if (p13nGroupView) {
        p13nGroupView.addEventListener('click', (e) => {
            const foodLink = e.target.closest('.p13n-food-link');

            if (foodLink) {
                const foodId = parseInt(foodLink.dataset.foodId, 10);
                showFoodModal(foodId); // Open in VIEW mode
            }
        });
    }

    // Add listener for personalization 'tolerance' accordion
    const p13nToleranceView = document.getElementById('personalization-tolerance-view');
        if (p13nToleranceView) {
        p13nToleranceView.addEventListener('click', (e) => {
            const foodLink = e.target.closest('.p13n-food-link');

            if (foodLink) {
                const foodId = parseInt(foodLink.dataset.foodId, 10);
                showFoodModal(foodId); // Open in VIEW mode
            }
        });
    }

    // Add listener for personalization search input
    const p13nSearchInput = document.getElementById('p13n-search-input');
    if (p13nSearchInput) {
        p13nSearchInput.addEventListener('input', () => {
            renderPersonalizationSummary(); // Re-render the list on every key press
        });
    }

    const openSide = () => {
        // Set the active phase button *before* showing the menu
        const phaseToggleBtns = document.querySelectorAll('#side-menu-phases .log-view-toggle-btn');
        phaseToggleBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.phase === appState.userProfile.currentPhase);
        });
        sideMdl.classList.remove('hidden'); 
        sideOvl.classList.remove('hidden'); 
    }; 
    const closeSide = () => { sideMdl.classList.add('hidden'); sideOvl.classList.add('hidden'); }; 
    const openInfo = () => { infoMdl.classList.remove('hidden'); }; 
    const closeInfo = () => { infoMdl.classList.add('hidden'); };

    /**
     * Opens the Auth modal and configures it for 'login' or 'signup'
     * @param {string} mode - 'login' or 'signup'
     */
    function openAuthModal(mode = 'login') {
        appState.currentAuthMode = mode;
        authError.classList.add('hidden'); // Hide old errors
        authForm.reset(); // Clear old inputs

        // Reset views
        if (authViewForm) authViewForm.classList.remove('hidden');
        if (authViewVerify) authViewVerify.classList.add('hidden');
        if (authViewGoogleConsent) authViewGoogleConsent.classList.add('hidden');

        // Reset password visibility on modal open
        if (authPasswordInput) authPasswordInput.type = 'password';
        if (authPasswordToggle) authPasswordToggle.innerHTML = '<i class="fas fa-eye"></i>';

        if (mode === 'signup') {
            authModalTitle.textContent = 'Sign Up';
            authNameField.classList.remove('hidden');
            authForgotPasswordLink.classList.add('hidden'); // Hide for signup
            
            // --- NEW: Show Legal Checkboxes ---
            if (authLegalCheckboxes) authLegalCheckboxes.classList.remove('hidden');
            
            // Disable button initially for signup
            authSubmitBtn.disabled = true;
            authSubmitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            
            authSubmitBtn.textContent = 'Sign Up';
            authSwitchLink.innerHTML = 'Already have an account? <button id="auth-switch-btn" class="font-bold text-primary underline">Log In</button>';
        } else {
            // Default to login
            authModalTitle.textContent = 'Log In';
            authNameField.classList.add('hidden');
            authForgotPasswordLink.classList.remove('hidden'); // Show for login
            
            // --- NEW: Hide Legal Checkboxes ---
            if (authLegalCheckboxes) authLegalCheckboxes.classList.add('hidden');
            
            // Enable button for login
            authSubmitBtn.disabled = false;
            authSubmitBtn.classList.remove('opacity-50', 'cursor-not-allowed');

            authSubmitBtn.textContent = 'Log In';
            authSwitchLink.innerHTML = 'Don\'t have an account? <button id="auth-switch-btn" class="font-bold text-primary underline">Sign Up</button>';
        }

        authModal.classList.remove('hidden');
    }

    function closeAuthModal() {
        // --- NEW: Cleanup Pending Google User AND Firestore Data ---
        if (appState.pendingGoogleUser) {
            const userToDelete = appState.pendingGoogleUser;
            const uid = userToDelete.uid;
            appState.pendingGoogleUser = null;

            // 1. CRITICAL FIX: Detach listeners FIRST
            // This prevents the app from detecting the deletion and auto-reloading
            // before we have a chance to delete the auth account.
            if (unsubscribeFromFirestore) {
                unsubscribeFromFirestore();
                unsubscribeFromFirestore = null;
            }

            const userDocRef = db.collection('users').doc(uid);
            const logsColRef = userDocRef.collection('logs');
            const dietColRef = userDocRef.collection('diet');

            // 2. Clean up Firestore
            Promise.all([
                deleteCollection(logsColRef),
                deleteCollection(dietColRef),
                userDocRef.delete()
            ])
            .then(() => {
                console.log('Orphaned Firestore data cleaned up.');
                // 3. Delete Auth User
                return userToDelete.delete();
            })
            .then(() => {
                console.log('Pending user deleted on modal close.');
                showToast("Account creation cancelled.", "warning");
                // 4. Reload to ensure a clean Guest state
                window.location.reload();
            })
            .catch((error) => {
                console.error("Error cleaning up pending user:", error);
                // Fallback: Force sign out and reload
                auth.signOut().then(() => window.location.reload());
            });
            
            // Return early to prevent the rest of the modal close logic 
            // from interfering before the reload happens.
            return; 
        }
        // --- END NEW ---

        authModal.classList.add('hidden');
        authForm.reset();
        
        // Reset UI state
        if (authCheckTerms) authCheckTerms.checked = false;
        if (authCheckHealth) authCheckHealth.checked = false;
        if (authSubmitBtn) {
            authSubmitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            authSubmitBtn.disabled = false;
        }
    }

    /**
     * Shows a loading state on the auth modal
     * @param {boolean} isLoading - Whether to show the loading state
     */
    function setAuthLoading(isLoading) {
        authError.classList.add('hidden'); // Hide old errors
        authSubmitBtn.disabled = isLoading;
        if (isLoading) {
            authSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        } else {
            // Restore text based on the current mode
            authSubmitBtn.textContent = (appState.currentAuthMode === 'login') ? 'Log In' : 'Sign Up';
        }
    }

    /**
     * Shows an error message in the auth modal
     * @param {string} message - The error message to display
     */
    function showAuthError(message) {
        setAuthLoading(false);
        authError.textContent = message;
        authError.classList.remove('hidden');
    }
        
    hamBtn.addEventListener('click', openSide); 
    sideClose.addEventListener('click', closeSide); 
    sideOvl.addEventListener('click', closeSide); 
    openInfoBtn.addEventListener('click', () => { closeSide(); openInfo(); }); 
    infoClose.addEventListener('click', closeInfo); 
    infoCloseBtn.addEventListener('click', closeInfo);

    // --- Auth Modal Listeners ---
    menuLoginBtn.addEventListener('click', () => {
        closeSide(); // Close side menu first
        if (!isFirebaseAvailable) {
            showToast("Cannot log in while offline (SDK missing).", "error");
            return;
        }
        openAuthModal('login'); // Open modal in login mode
    });

    authModalClose.addEventListener('click', closeAuthModal);

    // Event delegation for the dynamic switch button
    authSwitchLink.addEventListener('click', (e) => {
        if (e.target.id === 'auth-switch-btn') {
            const newMode = (appState.currentAuthMode === 'login') ? 'signup' : 'login';
            openAuthModal(newMode);
        }
    });

    // --- Handle Email/Password Form Submit ---
    authForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop the form from reloading
        setAuthLoading(true);

    const email = authEmailInput.value;
    const password = authPasswordInput.value;

    if (appState.currentAuthMode === 'signup') {
        // --- SIGN UP ---
        const name = authNameInput.value;
        
        // --- NEW: Mark consent as true before creation ---
        // This ensures the data uploaded by the listener is correct
        appState.userProfile.hasConsentedToGDPR = true;
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));

        if (!name) {
            showAuthError('Please enter your name.');
            return;
        }

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Update the user's Firebase profile with their name
                return userCredential.user.updateProfile({
                    displayName: name
                });
            })
            .then(() => {
                // User is created and name is set
                console.log('User signed up and profile updated:', auth.currentUser);
                setAuthLoading(false);
                
                // --- NEW: Send Verification & Switch View ---
                const user = auth.currentUser;
                if (user && !user.emailVerified) {
                    // Send the email immediately
                    user.sendEmailVerification().catch(err => console.error("Auto-send verify failed", err));
                    
                    // Switch modal view
                    if (authVerifyEmailDisplay) authVerifyEmailDisplay.textContent = user.email;
                    if (authViewForm) authViewForm.classList.add('hidden');
                    if (authViewVerify) authViewVerify.classList.remove('hidden');
                    
                    // Don't close the modal yet
                } else {
                    closeAuthModal();
                }
                // --- END NEW ---
            })
            .catch((error) => {
                let message = 'An unknown error occurred.';
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        message = 'This email is already in use. Try logging in.';
                        break;
                    case 'auth/weak-password':
                        message = 'Password should be at least 6 characters.';
                        break;
                    case 'auth/invalid-email':
                        message = 'Please enter a valid email address.';
                        break;
                    default:
                        message = error.message;
                }
                showAuthError(message);
            });

    } else {
        // --- LOG IN ---
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // User is logged in
                console.log('User logged in:', userCredential.user);
                setAuthLoading(false);
                closeAuthModal();
            })
            .catch((error) => {
                let message = 'An unknown error occurred.';
                // This is the new, generic error code for v9+
                if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                    message = 'Invalid email or password.';
                } else {
                    message = error.message;
                }
                showAuthError(message);
            });
    }
});

    // --- NEW: GDPR Checkbox Logic ---
    function checkSignupConsent() {
        // Only run this check if we are in signup mode
        if (appState.currentAuthMode !== 'signup') return;

        const terms = authCheckTerms.checked;
        const health = authCheckHealth.checked;

        if (terms && health) {
            authSubmitBtn.disabled = false;
            authSubmitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            authSubmitBtn.disabled = true;
            authSubmitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    if (authCheckTerms && authCheckHealth) {
        authCheckTerms.addEventListener('change', checkSignupConsent);
        authCheckHealth.addEventListener('change', checkSignupConsent);
    }

    // --- NEW: Verification View Listeners ---
        if (authVerifyDoneBtn) {
            authVerifyDoneBtn.addEventListener('click', () => {
                // Reload user to get fresh token/status
                const user = auth.currentUser;
                if (user) {
                    authVerifyDoneBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
                    user.reload().then(() => {
                        if (user.emailVerified) {
                            showToast("Email verified! Welcome aboard.", "success");
                            closeAuthModal();
                            updateVerificationUI(user);
                        } else {
                            showToast("Not verified yet. Check your inbox.", "warning");
                            authVerifyDoneBtn.textContent = "I've Verified";
                        }
                    });
                }
            });
        }

        if (authVerifyResendBtn) {
            authVerifyResendBtn.addEventListener('click', () => handleSendVerification(authVerifyResendBtn));
        }
        
        if (authVerifySkipBtn) {
            authVerifySkipBtn.addEventListener('click', closeAuthModal);
        }
        
        if (bannerResendBtn) {
            bannerResendBtn.addEventListener('click', () => handleSendVerification(bannerResendBtn));
        }

        if (bannerVerifyCheckBtn) {
        bannerVerifyCheckBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                const originalText = bannerVerifyCheckBtn.textContent;
                bannerVerifyCheckBtn.textContent = "Checking...";
                user.reload().then(() => {
                    if (user.emailVerified) {
                        showToast("Email verified! Thanks.", "success");
                        updateVerificationUI(user);
                    } else {
                        showToast("Still unverified. Try refreshing.", "warning");
                        bannerVerifyCheckBtn.textContent = originalText;
                    }
                });
            }
        });
    }

    // --- Handle Google Sign-In Button ---
    authGoogleBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider)
            .then(async (result) => { // Note: Added async here
                const user = result.user;
                let isNewUser = result.additionalUserInfo?.isNewUser;

                // --- NEW: ROBUSTNESS CHECK ---
                // If Firebase says "Existing User", we must double-check Firestore
                if (!isNewUser) {
                    try {
                        // Force server fetch to bypass local cache
                        const userDoc = await db.collection('users').doc(user.uid).get({ source: 'server' });
                        
                        if (!userDoc.exists) {
                            console.log("User exists in Auth but has no Firestore data. Treating as new.");
                            isNewUser = true;
                        } else {
                            // RACE CONDITION FIX:
                            // If the doc exists, check if it has explicitly consented.
                            // Guest data uploaded by the background listener will have this as false.
                            const profile = userDoc.data().userProfile || {};
                            if (profile.hasConsentedToGDPR === false) {
                                console.log("User data exists but has not consented (Zombie Data). Treating as new.");
                                isNewUser = true;
                            }
                        }
                    } catch (err) {
                        console.error("Error checking user doc:", err);
                        isNewUser = true; // Fail safe
                    }
                }
                // --- END NEW ---

                if (isNewUser) {
                    // --- STOP! GDPR CHECK REQUIRED ---
                    console.log('New Google User (or Re-registering). Showing consent form...');
                    
                    // 1. Set the Pending Flag
                    appState.pendingGoogleUser = user;

                    // 2. Switch Views
                    if (authViewForm) authViewForm.classList.add('hidden');
                    if (authViewGoogleConsent) authViewGoogleConsent.classList.remove('hidden');
                    
                    // 3. Setup Listeners
                    const checkGoogleConsent = () => {
                        const t = googleCheckTerms.checked;
                        const h = googleCheckHealth.checked;
                        if (t && h) {
                            googleConsentConfirmBtn.disabled = false;
                            googleConsentConfirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                        } else {
                            googleConsentConfirmBtn.disabled = true;
                            googleConsentConfirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
                        }
                    };

                    googleCheckTerms.onclick = checkGoogleConsent;
                    googleCheckHealth.onclick = checkGoogleConsent;
                    
                    // Reset checkboxes
                    googleCheckTerms.checked = false;
                    googleCheckHealth.checked = false;
                    checkGoogleConsent(); 

                    // Confirm Button (Success)
                    googleConsentConfirmBtn.onclick = async () => { // Make async
                        // 1. Update Firestore to mark as consented
                        try {
                            await db.collection('users').doc(user.uid).set({
                                userProfile: { hasConsentedToGDPR: true }
                            }, { merge: true });
                            
                            // Update local state too
                            appState.userProfile.hasConsentedToGDPR = true;
                        } catch (e) {
                            console.error("Error saving consent:", e);
                        }

                        appState.pendingGoogleUser = null; 
                        
                        closeAuthModal();
                        showToast("Welcome! Account created.", "success");
                        
                        googleConsentConfirmBtn.onclick = null;
                        googleConsentCancelBtn.onclick = null;
                    };

                    // Cancel Button (Fail)
                    googleConsentCancelBtn.onclick = closeAuthModal;

                } else {
                    // --- EXISTING USER ---
                    console.log('Existing Google User with Data. Logging in...');
                    closeAuthModal();
                }
            })
            .catch((error) => {
                console.error('Google sign-in error:', error.message);
                showAuthError(error.message);
            });
    });

    // --- NEW: Auth Helper Listeners ---
    if (authPasswordToggle) {
        authPasswordToggle.addEventListener('click', () => {
            if (authPasswordInput.type === 'password') {
                authPasswordInput.type = 'text';
                authPasswordToggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                authPasswordInput.type = 'password';
                authPasswordToggle.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    }

    if (authForgotPasswordLink) {
        authForgotPasswordLink.addEventListener('click', () => {
            const email = authEmailInput.value.trim();
            if (!email) {
                showAuthError("Please enter your email address above.");
                authEmailInput.focus();
                return;
            }

            showActionModal({
                title: 'Reset Password',
                message: `This will send a password reset link to ${email}. Please check your inbox and spam folder.`,
                confirmText: 'Send Link',
                onConfirm: () => {
                    auth.sendPasswordResetEmail(email)
                        .then(() => {
                            showToast("Password reset email sent! Check your inbox and spam folder.", "success");
                            closeAuthModal();
                        })
                        .catch((error) => {
                            // Close the action modal, show error in the auth modal
                            console.error("Password reset error:", error);
                            showAuthError("Error: " + error.message);
                        });
                }
            });
        });
    }

    // --- NEW: Continue as Guest Listener ---
    if (authContinueGuestBtn) {
        authContinueGuestBtn.addEventListener('click', () => {
            closeAuthModal();
        });
    }

    // --- NEW: Guest Help Button Listener ---
    if (authGuestHelpBtn) {
        authGuestHelpBtn.addEventListener('click', () => {
            showActionModal({
                title: 'Guest vs. Account',
                message: "Guest data is stored locally on your device's browser. If you clear your browser cache or switch devices, your data will be lost.\n\nCreating a free account saves your data to the cloud, allowing you to sync between devices and keep a secure backup.",
                confirmText: 'Got it!',
                onConfirm: () => {}, // Just closes the modal
                cancelText: null // Hides the cancel button
            });
        });
    }
    // --- END: Auth Modal Listeners ---

    // --- Handle Logout Button ---
    menuLogoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            // Wipe local data for privacy (as we decided)
            localStorage.removeItem('fodmapLogEntries');
            localStorage.removeItem('fodmapUserProfile');
            // Reload the page
            location.reload();
        }).catch((error) => {
            console.error('Logout Error:', error);
        });
    });

    // --- Handle Logout Button ---
    menuLogoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            // Wipe local data for privacy (as we decided)
            localStorage.removeItem('fodmapLogEntries');
            localStorage.removeItem('fodmapUserProfile');
            // Reload the page
            location.reload();
        }).catch((error) => {
            console.error('Logout Error:', error);
        });
    });

    /**
     * Forces a user logout, clears all local data, and reloads the app.
     * This is the definitive logout action.
     */
    function forceLogoutAndReload() {
        // We must clear local data *before* reloading
        localStorage.removeItem('fodmapLogEntries');
        localStorage.removeItem('fodmapUserProfile');
        
        // We tell auth to sign out, but we don't wait for it.
        // The reload will handle the UI reset.
        auth.signOut().catch(err => console.error("Sign out error on forced reload:", err));
        
        // Use a tiny delay to ensure the signOut message is sent
        // before the page is torn down.
        setTimeout(() => {
            location.reload();
        }, 100);
    }

    /**
     * Saves a specific piece of the app state to Firestore if the user is logged in.
     * @param {string} key - 'logEntries' or 'userProfile'
     * @param {any} data - The data to save (e.g., appState.logEntries)
     */
    async function saveToCloud(key, data) {
        if (!auth || !db) return; // Safety check
        const user = auth.currentUser;
        if (!user) return; // Not logged in, do nothing

        try {
            const userDocRef = db.collection('users').doc(user.uid);
            // Use .set with merge:true. This is safer.
            // It will create or update the document without failing.
            await userDocRef.set({
                [key]: data
            }, { merge: true });
            console.log(`Saved "${key}" to cloud.`);
        } catch (e) {
            console.error(`Error saving "${key}" to cloud:`, e);
            showToast('Error syncing changes to cloud.', 'error');
        }
    }

    // --- START: NEW CLOUD FUNCTIONS (SUB-COLLECTIONS) ---

    /**
     * Adds a new log document to the user's /logs sub-collection.
     * @param {object} logData - The log entry object.
     */
    async function addLogToCloud(logData) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            // Use the log's 'id' (which is Date.now()) as the document ID
            const docId = String(logData.id);
            await db.collection('users').doc(user.uid).collection('logs').doc(docId).set(logData);
            console.log('Log added to cloud:', docId);
        } catch (e) {
            console.error('Error adding log to cloud:', e);
            showToast('Error saving new log to cloud.', 'error');
        }
    }

    /**
     * Updates an existing log document in the user's /logs sub-collection.
     * @param {string|number} logId - The ID of the log document.
     * @param {object} logData - The complete log entry object to update.
     */
    async function updateLogInCloud(logId, logData) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const docId = String(logId);
            // Use .set() to overwrite the document with the new data
            await db.collection('users').doc(user.uid).collection('logs').doc(docId).set(logData, { merge: true });
            console.log('Log updated in cloud:', docId);
        } catch (e) {
            console.error('Error updating log in cloud:', e);
            showToast('Error updating log in cloud.', 'error');
        }
    }

    /**
     * Deletes a log document from the user's /logs sub-collection.
     * @param {string|number} logId - The ID of the log document to delete.
     */
    async function deleteLogFromCloud(logId) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const docId = String(logId);
            await db.collection('users').doc(user.uid).collection('logs').doc(docId).delete();
            console.log('Log deleted from cloud:', docId);
        } catch (e) {
            console.error('Error deleting log from cloud:', e);
            showToast('Error deleting log from cloud.', 'error');
        }
    }

    /**
     * Adds a new diet food document to the user's /diet sub-collection.
     * @param {object} foodData - The food object.
     */
    async function addFoodToCloud(foodData) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            // Use the food's 'id' as the document ID
            const docId = String(foodData.id);
            await db.collection('users').doc(user.uid).collection('diet').doc(docId).set(foodData);
            console.log('Diet food added to cloud:', docId);
        } catch (e) {
            console.error('Error adding diet food to cloud:', e);
            showToast('Error saving new food to cloud.', 'error');
        }
    }

    /**
     * Updates an existing diet food document in the user's /diet sub-collection.
     * @param {string|number} foodId - The ID of the food document.
     * @param {object} foodData - The complete food object to update.
     */
    async function updateFoodInCloud(foodId, foodData) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const docId = String(foodId);
            // Use .set() to overwrite
            await db.collection('users').doc(user.uid).collection('diet').doc(docId).set(foodData, { merge: true });
            console.log('Diet food updated in cloud:', docId);
        } catch (e) {
            console.error('Error updating diet food in cloud:', e);
            showToast('Error updating food in cloud.', 'error');
        }
    }

    /**
     * Deletes a diet food document from the user's /diet sub-collection.
     * @param {string|number} foodId - The ID of the food document to delete.
     */
    async function deleteFoodFromCloud(foodId) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const docId = String(foodId);
            await db.collection('users').doc(user.uid).collection('diet').doc(docId).delete();
            console.log('Diet food deleted from cloud:', docId);
        } catch (e) {
            console.error('Error deleting diet food from cloud:', e);
            showToast('Error deleting food from cloud.', 'error');
        }
    }

    /**
     * Deletes all documents in a Firestore collection in batches.
     * @param {firebase.firestore.CollectionReference} collectionRef - The reference to the collection to delete.
     * @param {number} batchSize - The number of documents to delete in each batch.
     */
    async function deleteCollection(collectionRef, batchSize = 50) {
        const query = collectionRef.limit(batchSize);

        while (true) {
            const snapshot = await query.get();
            if (snapshot.size === 0) {
                break; // Collection is empty
            }

            // Create a new batch
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Commit the batch
            await batch.commit();
        }
    }

    // --- END: NEW CLOUD FUNCTIONS (SUB-COLLECTIONS) ---

    /**
     * Sets up a real-time listener for the user's data.
     * This handles all data syncing (initial load, guest-merge, and live updates).
     * @param {firebase.User} user - The authenticated user.
     */
    function setupRealtimeListener(user) {
        if (!user) return;

        const userDocRef = db.collection('users').doc(user.uid);

        // --- NEW GUEST MERGE LOGIC ---
        // 1. Check for local "guest" data
        const localLogs = JSON.parse(localStorage.getItem('fodmapLogEntries')) || [];
        const localProfile = JSON.parse(localStorage.getItem('fodmapUserProfile')) || defaultProfile;
        const localDietFoods = localProfile.personalizationFoods || [];

        const hasLocalLogs = localLogs.length > 0;
        const hasLocalDiet = localDietFoods.length > 0;

        // --- NEW: Check if this local data is just a cache for the current user ---
        const isUserDataCache = (localProfile.loggedInUid === user.uid);
        // --- END NEW ---

        // 2. Check if this is a brand new user (doc doesn't exist)
        userDocRef.get().then(doc => {
            const isNewUser = !doc.exists;

            // --- SCENARIO 1: NEW USER ---
            // If the user is new, we *always* upload their guest data.
            // No need to ask permission.
            if (isNewUser) {
                console.log('New user, uploading guest data...');
                // Ensure profile has user's name/email from auth
                localProfile.displayName = user.displayName || null;
                localProfile.email = user.email || null;
                localProfile.isPremium = false; // Default
                
                // We use a batch to do this all at once
                const batch = db.batch();
                
                // 1. Set the main userProfile document
                batch.set(userDocRef, { userProfile: localProfile });
                
                // 2. Add all local logs
                const logsColRef = userDocRef.collection('logs');
                localLogs.forEach(log => {
                    batch.set(logsColRef.doc(String(log.id)), log);
                });
                
                // 3. Add all local diet foods
                const dietColRef = userDocRef.collection('diet');
                localDietFoods.forEach(food => {
                    batch.set(dietColRef.doc(String(food.id)), food);
                });

                // Commit the batch and then attach listeners
                batch.commit().then(() => {
                    console.log('Guest data uploaded to new cloud account.');
                    showToast('Account created & data backed up!', 'success');
                    
                    // --- NEW FIX: Clear local data after successful upload ---
                    localStorage.removeItem('fodmapLogEntries');
                    localStorage.removeItem('fodmapUserProfile');
                    
                    attachListener(userDocRef); // Now attach
                }).catch(error => {
                    console.error("Error creating new user document:", error);
                    showToast('Error saving data to cloud.', 'error');
                    attachListener(userDocRef); // Attach anyway as a fallback
                });
                return; // Stop execution here
            }

            // --- SCENARIO 2: EXISTING USER with GUEST DATA ---
            // The user is logging into a device that has local guest data.
            // We must ask them what to do.
            // --- MODIFIED: Only show if it's NOT their own cache ---
            if ((hasLocalLogs || hasLocalDiet) && !isUserDataCache) {
                let logText = hasLocalLogs ? `${localLogs.length} log entries` : '';
                let dietText = hasLocalDiet ? `${localDietFoods.length} diet foods` : '';
                let message = `You have ${logText}${hasLocalLogs && hasLocalDiet ? ' and ' : ''}${dietText} saved on this device. Would you like to merge them with your cloud account?`;

                showActionModal({
                    title: 'Local Data Found',
                    message: message,
                    confirmText: 'Merge',
                    onConfirm: async () => {
                        try {
                            const batch = db.batch();
                            
                            // 1. Add all local logs
                            const logsColRef = userDocRef.collection('logs');
                            localLogs.forEach(log => {
                                batch.set(logsColRef.doc(String(log.id)), log, { merge: true });
                            });
                            
                            // 2. Add all local diet foods
                            const dietColRef = userDocRef.collection('diet');
                            localDietFoods.forEach(food => {
                                batch.set(dietColRef.doc(String(food.id)), food, { merge: true });
                            });
                            
                            await batch.commit();
                            showToast('Local data merged!', 'success');
                            
                            // Clear local data *after* successful merge
                            localStorage.removeItem('fodmapLogEntries');
                            localStorage.removeItem('fodmapUserProfile'); // Clear the whole profile
                            
                            attachListener(userDocRef);
                            
                        } catch (e) {
                            console.error("Merge failed:", e);
                            showToast("Merge failed. Discarding local data.", "error");
                            attachListener(userDocRef);
                        }
                    },
                    altText: 'Discard',
                    onAltConfirm: () => {
                        showToast('Discarding local data...', 'warning');
                        
                        // Clear local storage
                        localStorage.removeItem('fodmapLogEntries');
                        localStorage.removeItem('fodmapUserProfile');

                        // --- NEW FIX: Clear in-memory state ---
                        // This forces the app to *only* show what the cloud listeners provide.
                        appState.logEntries = [];
                        appState.userProfile = { ...defaultProfile, personalizationFoods: [] };
                        
                        // Attach listener, which will load cloud data
                        attachListener(userDocRef);
                    },
                    cancelText: 'Log Out',
                    onCancel: () => {
                        auth.signOut(); // Safest option is to log out
                    }
                });
            } else {
                // --- SCENARIO 3: EXISTING USER, NO GUEST DATA ---
                // This is the normal login scenario.
                console.log('Existing user, no local data. Attaching listener...');
                attachListener(userDocRef);
            }
        }).catch(error => {
            console.error("Error checking user document:", error);
            // If offline/error, we assume standard load and attach listeners anyway
            // so the user can see their local data (if any) or at least the empty UI.
            attachListener(userDocRef); 
        });
    }

    /**
     * Helper function that attaches the onSnapshot listener.
     * This is the core of the real-time sync.
     * @param {firebase.firestore.DocumentReference} userDocRef
     */
    function attachListener(userDocRef) {
        // Detach any old listener before attaching a new one
        if (unsubscribeFromFirestore) {
            unsubscribeFromFirestore(); // This will be an array of functions
        }
        
        let initialLoad = true;
        const listeners = [];

        // --- 1. LISTENER FOR USER PROFILE (SETTINGS) ---
        const profileUnsub = userDocRef.onSnapshot((doc) => {
            console.log("Firestore User Profile updated!");
            if (doc.exists) {
                const cloudProfile = doc.data().userProfile;
                // Merge with default, but keep existing diet list
                appState.userProfile = { 
                    ...defaultProfile, 
                    ...(cloudProfile || {}),
                    personalizationFoods: appState.userProfile.personalizationFoods // Keep local diet list
                };
                
                // --- NEW: Tag the cache with the logged-in User ID ---
                appState.userProfile.loggedInUid = userDocRef.id;
                
                // Save to localStorage
                localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                
                // Re-render UI
                updateUiForPhase(appState.userProfile.currentPhase);
                setupProfilePage();
                updatePremiumUI();

                // --- Update AI Counter ---
                updateAICounterUI();

            } else {
                    // The user document was deleted. This is triggered on other
                    // clients (like Browser B) after an account deletion.
                    // We must force a full reload.
                    console.warn("User document does not exist. Forcing logout and reload.");
                    showToast("Account deleted. Logging out...", "warning");
                    forceLogoutAndReload(); // <-- This is the fix
                }
            }, (error) => {
            // --- THIS IS THE REAL FIX ---
            // This handles the case where the user is deleted, and our
            // permission to *read* the document is revoked.
            console.error("Firestore profile listener error:", error);
            
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                console.warn("Permission denied listening to profile. Forcing logout.");
                showToast("Account logged out. Logging out...", "warning");
                
                // Call the new, reliable helper function
                forceLogoutAndReload();
                
            } else {
                // A different error, like network loss
                showToast('Sync connection lost.', 'error');
            }
        });
        listeners.push(profileUnsub);

        // --- 2. LISTENER FOR /logs SUB-COLLECTION ---
        const logsUnsub = userDocRef.collection('logs').onSnapshot((snapshot) => {
            console.log("Firestore Logs updated!");
            snapshot.docChanges().forEach((change) => {
                const logData = change.doc.data();
                const logId = logData.id;
                
                if (change.type === "added") {
                    // Add if it's not already in the local state
                    if (!appState.logEntries.some(log => log.id === logId)) {
                        appState.logEntries.push(logData);
                    }
                }
                if (change.type === "modified") {
                    const index = appState.logEntries.findIndex(log => log.id === logId);
                    if (index > -1) {
                        appState.logEntries[index] = logData; // Overwrite
                    }
                }
                if (change.type === "removed") {
                    appState.logEntries = appState.logEntries.filter(log => log.id !== logId);
                }
            });
            
            // Save local cache and re-render
            localStorage.setItem('fodmapLogEntries', JSON.stringify(appState.logEntries));
            renderLogEntries();
            renderHomePage(); // This updates charts and progress

        }, (error) => {
            console.error("Firestore logs listener error:", error);
        });
        listeners.push(logsUnsub);

        // --- 3. LISTENER FOR /diet SUB-COLLECTION ---
        const dietUnsub = userDocRef.collection('diet').onSnapshot((snapshot) => {
            console.log("Firestore Diet updated!");
            snapshot.docChanges().forEach((change) => {
                const foodData = change.doc.data();
                const foodId = foodData.id;
                
                if (change.type === "added") {
                    if (!appState.userProfile.personalizationFoods.some(food => food.id === foodId)) {
                        appState.userProfile.personalizationFoods.push(foodData);
                    }
                }
                if (change.type === "modified") {
                    const index = appState.userProfile.personalizationFoods.findIndex(food => food.id === foodId);
                    if (index > -1) {
                        appState.userProfile.personalizationFoods[index] = foodData;
                    }
                }
                if (change.type === "removed") {
                    appState.userProfile.personalizationFoods = appState.userProfile.personalizationFoods.filter(food => food.id !== foodId);
                }
            });
            
            // Save local cache and re-render
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            renderPersonalizationSummary();
            
        }, (error) => {
            console.error("Firestore diet listener error:", error);
        });
        listeners.push(dietUnsub);

        // --- 4. MANAGE LISTENERS ---
        // Store all unsubscribe functions
        unsubscribeFromFirestore = () => {
            listeners.forEach(unsub => unsub());
        };
        
        // On initial load, navigate to home page
        if (initialLoad) {
            if (!document.querySelector('.page:not(.hidden)')) {
                navigateTo('home');
            }
            initialLoad = false;
        }
    }

    // --- NEW: Account Settings Page Listeners ---

    // Button in side menu to open the page
    if (menuAccountBtn) {
        menuAccountBtn.addEventListener('click', () => {
            closeSide();
            navigateTo('account-settings');
        });
    }

    // Back button on the settings page
    if (accountBackBtn) {
        accountBackBtn.addEventListener('click', () => {
            // We go back to the 'profile' tab as it's the most logical place
            navigateTo('profile');
        });
    }

    // Save Display Name
    if (accountSettingsForm) {
        accountSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevents form reload
            const newName = accountNameInput.value.trim();
            const user = auth.currentUser;

            if (newName && user) {
                accountSaveNameBtn.disabled = true;
                accountSaveNameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                user.updateProfile({
                    displayName: newName
                }).then(() => {
                    showToast("Name updated!", "success");
                    // Update the profile page form just in case
                    if (authNameInput) authNameInput.value = newName;
                }).catch((error) => {
                    console.error("Error updating name:", error);
                    showToast("Error saving name.", "error");
                }).finally(() => {
                    accountSaveNameBtn.disabled = false;
                    accountSaveNameBtn.textContent = 'Save';
                });
            }
        });
    }

    // Send Password Reset
    if (accountPasswordResetBtn) {
        accountPasswordResetBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user || !user.email) {
                showToast("Error: No user found.", "error");
                return;
            }

            showActionModal({
                title: 'Reset Password',
                message: `This will send a password reset link to ${user.email}. Please check your inbox and spam folder.`,
                confirmText: 'Send Link',
                onConfirm: () => {
                    auth.sendPasswordResetEmail(user.email)
                        .then(() => {
                            showToast("Password reset email sent!", "success");
                        })
                        .catch((error) => {
                            console.error("Password reset error:", error);
                            showToast("Error: " + error.message, "error");
                        });
                }
            });
        });
    }

    // Delete Account
    if (accountDeleteBtn) {
        accountDeleteBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) return;

            showActionModal({
                title: 'Delete Account',
                message: `This is permanent and cannot be undone. All your cloud data (logs, diet list, and settings) will be deleted. Are you sure?`,
                altText: 'Delete Forever', // Red button
                onAltConfirm: async () => {
                    const userDocRef = db.collection('users').doc(user.uid);
                    const logsColRef = userDocRef.collection('logs');
                    const dietColRef = userDocRef.collection('diet');

                    try {
                        // Step 1: Delete auth user FIRST
                        // This invalidates the session and triggers listeners on all clients
                        await user.delete();
                        console.log('Auth user deleted.');

                        // Step 2: Delete all data
                        await deleteCollection(logsColRef);
                        await deleteCollection(dietColRef);
                        await userDocRef.delete();
                        console.log('Firestore data deleted.');
                        
                        // Step 3: Success! Show toast and force reload.
                        showToast("Account deleted. Logging you out.", "success");
                        forceLogoutAndReload(); // <--- SUCCESS PATH (for Browser A)

                    } catch (error) {
                        console.error("Error deleting account:", error);
                        
                        // Step 4: Failure. Show correct toast and force reload.
                        if (error.code === 'auth/requires-recent-login') {
                            showToast("Please log in again to confirm deletion.", "warning");
                        } else {
                            showToast("Error: " + error.message, "error");
                        }
                        forceLogoutAndReload(); // <--- FAILURE PATH
                    }
                }
            });
        });
    }

    /**
     * Updates the UI to reflect the user's email verification status.
     */
    function updateVerificationUI(user) {
        if (!user) {
            if (verificationBanner) verificationBanner.classList.add('hidden');
            return;
        }

        const isVerified = user.emailVerified;

        // 1. Banner
        if (verificationBanner) {
            // Only show if NOT verified and NOT anonymous
            if (!isVerified && !user.isAnonymous) {
                verificationBanner.classList.remove('hidden');
            } else {
                verificationBanner.classList.add('hidden');
            }
        }

        // 2. Account Settings Page
        if (accountEmailStatus) {
            if (isVerified) {
                accountEmailStatus.textContent = 'Verified ✅';
                accountEmailStatus.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700';
                accountEmailStatus.classList.remove('hidden');
            } else {
                accountEmailStatus.textContent = 'Unverified ⚠️';
                accountEmailStatus.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700';
                accountEmailStatus.classList.remove('hidden');
            }
        }
    }

    /**
     * Sends the verification email with cooldown protection and UI feedback.
     * @param {HTMLElement} btnElement - The button that triggered the action (for visual feedback).
     */
    function handleSendVerification(btnElement) {
        const user = auth.currentUser;
        if (!user) return;

        // Visual feedback
        const originalText = btnElement.textContent;
        btnElement.disabled = true;
        btnElement.textContent = "Sending...";

        user.sendEmailVerification()
            .then(() => {
                showToast("Verification link sent! Check your inbox.", "success");
                
                // Cooldown UI
                let count = 60;
                btnElement.textContent = `Sent! Wait ${count}s`;
                
                const interval = setInterval(() => {
                    count--;
                    if (count <= 0) {
                        clearInterval(interval);
                        btnElement.textContent = originalText;
                        btnElement.disabled = false;
                    } else {
                        btnElement.textContent = `Sent! Wait ${count}s`;
                    }
                }, 1000);
            })
            .catch((error) => {
                console.error("Verification error:", error);
                if (error.code === 'auth/too-many-requests') {
                    showToast("Please wait a while before trying again.", "warning");
                } else {
                    showToast("Error sending email.", "error");
                }
                // Reset button
                btnElement.textContent = originalText;
                btnElement.disabled = false;
            });
    }

    // --- CENTRAL AUTH LISTENER & OFFLINE FALLBACK ---
    
    const loadGuestState = () => {
        console.log('Loading Guest/Offline State...');

        // --- NEW: Hide Verification UI ---
        updateVerificationUI(null);

        // Update UI for "Guest"
        if (menuLoginLi) menuLoginLi.classList.remove('hidden');
        if (menuPremiumLi) menuPremiumLi.classList.remove('hidden'); 
        if (menuLogoutLi) menuLogoutLi.classList.add('hidden');
        if (menuAccountLi) menuAccountLi.classList.add('hidden');

        // User is a guest. Load from localStorage.
        appState.logEntries = JSON.parse(localStorage.getItem('fodmapLogEntries')) || [];
        const savedProfile = JSON.parse(localStorage.getItem('fodmapUserProfile')) || {};
        appState.userProfile = { 
            ...defaultProfile, 
            ...savedProfile,
            personalizationFoods: (savedProfile.personalizationFoods || []) 
        };

        // Render the guest UI
        updateUiForPhase(appState.userProfile.currentPhase);
        setupProfilePage();
        updatePremiumUI(); // Update badges/banners
        
        // Only navigate if no other page is visible (i.e., on first load)
        if (!document.querySelector('.page:not(.hidden)')) {
            navigateTo('home');
        }

        // Only show onboarding for guests who have not completed it
        if (!appState.userProfile.hasCompletedOnboarding) {
            setTimeout(() => {
                showOnboardingModal();
            }, 100);
        }
        
        // If Firebase is available but user is just logged out, prompt login.
        // If Firebase is NOT available, do not show login modal.
        if (isFirebaseAvailable) {
            openAuthModal('login');
        } else {
            showToast("You are offline. Running in Guest Mode.", "warning");
        }
    };

    if (isFirebaseAvailable && auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                // --- USER IS LOGGED IN ---
                console.log('User is logged in:', user.uid);

                if (onboardingModal) onboardingModal.classList.add('hidden');

                // Render Auth UI
                if (menuLoginLi) menuLoginLi.classList.add('hidden');
                if (menuLogoutLi) menuLogoutLi.classList.remove('hidden');
                if (menuAccountLi) menuAccountLi.classList.remove('hidden');

                updateVerificationUI(user);
                updateAICounterUI();
                
                if (menuAccountEmail) menuAccountEmail.textContent = user.email || 'Account Settings';
                if (accountNameInput) accountNameInput.value = user.displayName || '';
                if (accountEmailInput) accountEmailInput.value = user.email || '';
                
                // Set up DB Sync
                setupRealtimeListener(user); 

            } else {
                // --- USER IS LOGGED OUT ---
                console.log('User is logged out.');
                if (unsubscribeFromFirestore) {
                    unsubscribeFromFirestore();
                    unsubscribeFromFirestore = null;
                }
                loadGuestState();
            }
        });
    } else {
        // --- FIREBASE FAILED TO LOAD (OFFLINE START) ---
        console.warn("Firebase Auth not available. Forcing Guest Mode.");
        loadGuestState();
    }

    const geminiMdl = document.getElementById('gemini-modal'); const geminiTitle = document.getElementById('gemini-modal-title'); const geminiContent = document.getElementById('gemini-modal-content'); const geminiLoader = document.getElementById('gemini-modal-loader'); const geminiError = document.getElementById('gemini-modal-error'); const geminiClose = document.getElementById('gemini-modal-close');
    
    /**
     * Checks if the user has met the criteria to see the "Rate Us" popup.
     */
    function checkAndShowRatePopup() {
        const status = appState.userProfile.ratePopupStatus;
        const logCount = appState.logEntries.length;
        const aiCount = appState.userProfile.aiUsageCount || 0;

        // User has already given a final answer
        if (status === 'rated' || status === 'declined') {
            return;
        }

        let shouldShow = false;

        if (status === 'not_asked' && (logCount === 5 || aiCount === 3)) {
            shouldShow = true;
        } else if (status === 'remind_later' && (logCount === 15 || aiCount === 10)) {
            shouldShow = true;
        }

        if (shouldShow) {
            showActionModal({
                title: 'Enjoying the App?',
                message: "If you've found this app helpful, please take a moment to rate it. Your feedback is what keeps it growing!",
                confirmText: 'Rate Now',
                onConfirm: () => {
                    // Later, this will open the Play Store link
                    appState.userProfile.ratePopupStatus = 'rated';
                    localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                    saveToCloud('userProfile', appState.userProfile);
                    // window.open('YOUR_PLAY_STORE_LINK_HERE', '_blank');
                },
                altText: 'No, Thanks',
                onAltConfirm: () => {
                    appState.userProfile.ratePopupStatus = 'declined';
                    localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                    saveToCloud('userProfile', appState.userProfile);
                },
                cancelText: 'Remind Me Later',
                onCancel: () => {
                    appState.userProfile.ratePopupStatus = 'remind_later';
                    localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                    saveToCloud('userProfile', appState.userProfile);
                }
            });
        }
    }

    function openPremiumInfoModal() {
        if (premiumInfoModal) premiumInfoModal.classList.remove('hidden');
    }

    function closePremiumInfoModal() {
        if (premiumInfoModal) premiumInfoModal.classList.add('hidden');
    }

    // Attach listeners to the new modal buttons
    if (premiumInfoClose) premiumInfoClose.addEventListener('click', closePremiumInfoModal);
    if (premiumInfoCancel) premiumInfoCancel.addEventListener('click', closePremiumInfoModal);
    
    if (premiumInfoCta) {
        premiumInfoCta.addEventListener('click', () => {
            // Close the info modal
            closePremiumInfoModal();
            // Trigger the actual checkout flow
            initiateCheckout();
        });
    }

    // --- NEW: Action Modal Elements ---
    const actionModal = document.getElementById('action-modal');
    const actionModalClose = document.getElementById('action-modal-close');
    const actionModalTitle = document.getElementById('action-modal-title');
    const actionModalMessage = document.getElementById('action-modal-message');
    const actionModalInputContainer = document.getElementById('action-modal-input-container');
    const actionModalInput = document.getElementById('action-modal-input');
    const actionModalBtnCancel = document.getElementById('action-modal-btn-cancel');
    const actionModalBtnConfirm = document.getElementById('action-modal-btn-confirm');

    // --- NEW: Food Edit Modal Elements ---
    const foodModal = document.getElementById('food-edit-modal');
    const foodModalTitle = document.getElementById('food-modal-title');
    const foodModalClose = document.getElementById('food-modal-close');
    
    // View Mode
    const foodModalView = document.getElementById('food-modal-view');
    const foodModalViewContent = document.getElementById('food-modal-view-content');
    const foodModalDeleteBtn = document.getElementById('food-modal-delete-btn');
    const foodModalEditBtn = document.getElementById('food-modal-edit-btn');
    
    // Edit Mode
    const foodModalEdit = document.getElementById('food-modal-edit');
    const foodModalName = document.getElementById('food-modal-name');
    const foodModalGroup = document.getElementById('food-modal-group');
    const foodModalBtnTolerated = document.getElementById('food-modal-btn-tolerated');
    const foodModalBtnTrigger = document.getElementById('food-modal-btn-trigger');
    const foodModalStatus = document.getElementById('food-modal-status');
    const foodModalDoseLogicContainer = document.getElementById('food-modal-dose-logic-container');
    const foodModalBtnUpto = document.getElementById('food-modal-btn-upto');
    const foodModalBtnStartingAt = document.getElementById('food-modal-btn-startingat');
    const foodModalDoseLogic = document.getElementById('food-modal-doselogic');
    const foodModalDose = document.getElementById('food-modal-dose');
    const foodModalNotes = document.getElementById('food-modal-notes');
    const foodModalCancelBtn = document.getElementById('food-modal-cancel-btn');
    const foodModalSaveBtn = document.getElementById('food-modal-save-btn');
    
    // --- END: Food Edit Modal Elements ---

    // --- NEW: Pre-Treatment Settings Modal Elements ---
    const ptModal = document.getElementById('pretreatment-settings-modal');
    const ptModalClose = document.getElementById('pretreatment-modal-close');
    const ptModalForm = document.getElementById('pretreatment-modal-form');
    const ptModalStartDate = document.getElementById('pretreatment-modal-start-date');
    const ptModalDurationNum = document.getElementById('pretreatment-modal-duration-num');
    const ptModalDurationUnit = document.getElementById('pretreatment-modal-duration-unit');
    const ptModalRules = document.getElementById('pretreatment-modal-rules');
    const ptModalCancel = document.getElementById('pretreatment-modal-cancel');
    const ptModalSaveBtn = document.getElementById('pretreatment-modal-save-btn');
    // --- END: Pre-Treatment Settings Modal Elements ---

    // --- NEW: Restriction Settings Modal Elements ---
    const rsModal = document.getElementById('restriction-settings-modal');
    const rsModalClose = document.getElementById('restriction-modal-close');
    const rsModalForm = document.getElementById('restriction-modal-form');
    const rsModalStartDate = document.getElementById('restriction-modal-start-date');
    const rsModalDurationNum = document.getElementById('restriction-modal-duration-num');
    const rsModalDurationUnit = document.getElementById('restriction-modal-duration-unit');
    const rsModalCancel = document.getElementById('restriction-modal-cancel');
    const rsModalSaveBtn = document.getElementById('restriction-modal-save-btn');
    // --- END: Restriction Settings Modal Elements ---

    // --- NEW: Medication Settings Modal Elements ---
    const medModal = document.getElementById('medication-settings-modal');
    const medModalClose = document.getElementById('medication-modal-close');
    const medModalForm = document.getElementById('medication-modal-form');
    const medModalStartDate = document.getElementById('medication-start-date');
    const medModalDuration = document.getElementById('medication-duration');
    const medModalSettingsList = document.getElementById('medication-settings-list');
    const medModalAddBtn = document.getElementById('medication-add-btn');
    const medModalCancel = document.getElementById('medication-modal-cancel');
    const medModalSaveBtn = document.getElementById('medication-modal-save-btn');
    // --- END: Medication Settings Modal Elements ---

    // --- END: Action Modal Elements ---

    /**
     * Shows a custom modal for confirmations (yes/no) or prompts (input).
     * @param {object} config - Configuration object
     * @param {string} config.title - The text for the modal's title.
     * @param {string} config.message - The text for the modal's body.
     * @param {string} [config.type='confirm'] - 'confirm' or 'prompt'.
     * @param {string} [config.confirmText='OK'] - Text for the main (blue) confirm button.
     * @param {function} config.onConfirm - Callback function if confirmed. Receives input value if type is 'prompt'.
     * @param {string} [config.cancelText='Cancel'] - Text for the cancel button.
     * @param {function} [config.onCancel] - Callback function if cancelled.
     * @param {string} [config.altText] - Text for the alternate (red) button.
     * @param {function} [config.onAltConfirm] - Callback for the alternate button.
     */
    function showActionModal({ title, message, type = 'confirm', confirmText = 'OK', onConfirm, cancelText = 'Cancel', onCancel, altText, onAltConfirm }) {
        actionModalTitle.textContent = title;
        actionModalMessage.textContent = message;

        // Configure Confirm Button
        if (confirmText && onConfirm) {
            actionModalBtnConfirm.textContent = confirmText;
            actionModalBtnConfirm.classList.remove('hidden');
        } else {
            actionModalBtnConfirm.classList.add('hidden');
        }

        // Configure Cancel Button
        if (cancelText) {
            actionModalBtnCancel.textContent = cancelText;
            actionModalBtnCancel.classList.remove('hidden');
        } else {
            actionModalBtnCancel.classList.add('hidden');
        }
        
        const actionModalBtnAlt = document.getElementById('action-modal-btn-alt');

        // Configure for prompt
        if (type === 'prompt') {
            actionModalInputContainer.classList.remove('hidden');
            actionModalInput.value = ''; // Clear old value
            actionModalInput.focus();
        } else {
            actionModalInputContainer.classList.add('hidden');
        }
        
        // Configure Alt Button (Red)
        if (altText && onAltConfirm) {
            actionModalBtnAlt.textContent = altText;
            actionModalBtnAlt.classList.remove('hidden');
        } else {
            actionModalBtnAlt.classList.add('hidden');
        }

        // Configure Confirm Button (Blue)
        if (onConfirm) {
            actionModalBtnConfirm.textContent = confirmText;
            actionModalBtnConfirm.classList.remove('hidden');
        } else {
            actionModalBtnConfirm.classList.add('hidden');
        }

        actionModal.classList.remove('hidden');

        // --- Create temporary, one-time listeners ---
        const handleConfirm = () => {
            const inputValue = actionModalInput.value;
            if (type === 'prompt' && !inputValue.trim()) {
                actionModalInput.focus();
                return; 
            }
            if (onConfirm) {
                onConfirm(inputValue); // Pass the value
            }
            closeModal();
        };

        // --- NEW: Explicit handlers for Cancel and Close ---
        const handleCancelBtn = () => {
            if (onCancel) {
                onCancel(); // Run the specific cancel logic (e.g., auth.signOut())
            }
            closeModal();
        };

        const handleAltConfirm = () => {
            if (onAltConfirm) {
                onAltConfirm();
            }
            closeModal();
        };
        
        // This handler is for the 'X' button
        const handleCloseX = () => {
            if (onCancel) {
                onCancel(); // ALSO run the cancel logic
            }
            closeModal();
        };
        // --- END NEW HANDLERS ---

        const closeModal = () => {
            actionModal.classList.add('hidden');
            actionModalBtnConfirm.classList.remove('hidden');
            actionModalBtnAlt.classList.add('hidden');
            // Remove the temporary listeners
            actionModalBtnConfirm.removeEventListener('click', handleConfirm);
            actionModalBtnCancel.removeEventListener('click', handleCancelBtn); // Use new handler
            actionModalClose.removeEventListener('click', handleCloseX);     // Use new handler
            actionModalBtnAlt.removeEventListener('click', handleAltConfirm);
        };
        
        // Attach the new, one-time listeners
        actionModalBtnConfirm.addEventListener('click', handleConfirm);
        actionModalBtnCancel.addEventListener('click', handleCancelBtn); // Use new handler
        actionModalClose.addEventListener('click', handleCloseX);     // Use new handler
        actionModalBtnAlt.addEventListener('click', handleAltConfirm);
    }

    // --- NEW: Pre-Treatment Settings Modal Functions ---
    function showPreTreatmentModal() {
        if (!ptModal) return; // Safety check
        const settings = appState.userProfile.phaseSettings["pre-treatment"];
        
        ptModalStartDate.value = settings.startDate || '';
        ptModalDurationNum.value = settings.durationNum || 4;
        ptModalDurationUnit.value = settings.durationUnit || 'weeks';
        ptModalRules.value = settings.rules || '';
        
        ptModal.classList.remove('hidden');
    }

    function closePreTreatmentModal() {
        if (ptModal) ptModal.classList.add('hidden');
    }

    function savePreTreatmentSettings(e) {
        e.preventDefault();
        
        const settings = appState.userProfile.phaseSettings["pre-treatment"];
        settings.startDate = ptModalStartDate.value || null;
        settings.durationNum = parseInt(ptModalDurationNum.value, 10) || 4;
        settings.durationUnit = ptModalDurationUnit.value;
        settings.rules = ptModalRules.value;

        // Save to localStorage + cloud 
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);

        // Re-render home page components
        renderCountdown('pre-treatment');
        renderPreTreatmentCard();

        // Close modal and show toast
        closePreTreatmentModal();
        showToast("Pre-treatment settings saved!", "success");
    }

    // --- NEW: Pre-Treatment Modal Listeners ---
    if (ptModal) {
        const ptSettingsBtn = document.getElementById('pretreatment-settings-btn');
        const ptRulesBtn = document.getElementById('pretreatment-rules-settings-btn'); // New button

        if (ptSettingsBtn) {
            ptSettingsBtn.addEventListener('click', showPreTreatmentModal);
        }
        if (ptRulesBtn) { // Add listener for new button
            ptRulesBtn.addEventListener('click', showPreTreatmentModal);
        }
        
        ptModalClose.addEventListener('click', closePreTreatmentModal);
        ptModalCancel.addEventListener('click', closePreTreatmentModal);
        ptModalForm.addEventListener('submit', savePreTreatmentSettings);
    }

    // --- NEW: Restriction Settings Modal Functions ---
    function showRestrictionModal() {
        if (!rsModal) return; // Safety check
        const settings = appState.userProfile.phaseSettings["restriction"];
        
        rsModalStartDate.value = settings.startDate || '';
        rsModalDurationNum.value = settings.durationNum || 4;
        rsModalDurationUnit.value = settings.durationUnit || 'weeks';
        
        rsModal.classList.remove('hidden');
    }

    function closeRestrictionModal() {
        if (rsModal) rsModal.classList.add('hidden');
    }

    function saveRestrictionSettings(e) {
        e.preventDefault();
        
        const settings = appState.userProfile.phaseSettings["restriction"];
        settings.startDate = rsModalStartDate.value || null;
        settings.durationNum = parseInt(rsModalDurationNum.value, 10) || 4;
        settings.durationUnit = rsModalDurationUnit.value;

        // Save to localStorage + cloud 
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);

        // Re-render home page components
        renderCountdown('restriction');

        // Close modal and show toast
        closeRestrictionModal();
        showToast("Restriction settings saved!", "success");
    }

    // --- NEW: Restriction Modal Listeners ---
    if (rsModal) {
        document.getElementById('restriction-settings-btn').addEventListener('click', showRestrictionModal);
        rsModalClose.addEventListener('click', closeRestrictionModal);
        rsModalCancel.addEventListener('click', closeRestrictionModal);
        rsModalForm.addEventListener('submit', saveRestrictionSettings);
    }

    // --- NEW: Medication Tracker Functions & Listeners ---

    /**
     * Renders the list of medication inputs in the settings modal.
     */
    function renderMedicationSettingsList() {
        if (!medModalSettingsList) return;

        const medications = appState.userProfile.medicationTracker.medications;
        appState.currentMedicationIdCounter = 0; // Reset counter

        if (medications.length === 0) {
            medModalSettingsList.innerHTML = `<p class="text-xs text-subtle text-center">No medications added.</p>`;
            return;
        }

        medModalSettingsList.innerHTML = medications.map(med => {
            // Ensure IDs are unique for this session
            const uniqueId = med.id || `temp_${appState.currentMedicationIdCounter++}`;
            return `
                <div class="medication-settings-item" data-id="${uniqueId}">
                    <input type="time" class="med-input-time time-input" value="${med.time}">
                    <input type="text" class="med-input-name name-input" value="${med.name}" placeholder="Medication Name">
                    <button type="button" class="medication-remove-btn">&times;</button>
                </div>
            `;
        }).join('');
    }

    /**
     * Populates and shows the Medication Settings modal.
     */
    function showMedicationSettings() {
        if (!medModal) return;
        const tracker = appState.userProfile.medicationTracker;

        medModalStartDate.value = tracker.startDate || '';
        medModalDuration.value = tracker.duration || 12;

        // We MUST re-clone the array to avoid mutation
        // This gives the modal a temporary copy to work with
        const tempMeds = tracker.medications.map((med, index) => ({
            id: `med_${index}`, // Assign temporary stable IDs
            time: med.time,
            name: med.name
        }));

        // Pass this temporary array to the state
        appState.userProfile.medicationTracker.medications = tempMeds;
        renderMedicationSettingsList();

        medModal.classList.remove('hidden');
    }

    /**
     * Closes and resets the Medication Settings modal.
     */
    function closeMedicationSettings() {
        if (medModal) {
            medModal.classList.add('hidden');
            // IMPORTANT: Reset the medications array by re-loading from localStorage
            // This discards any un-saved changes from the modal
            const savedProfile = localStorage.getItem('fodmapUserProfile') ? JSON.parse(localStorage.getItem('fodmapUserProfile')) : {};
            const savedTracker = (savedProfile && savedProfile.medicationTracker) ? savedProfile.medicationTracker : defaultProfile.medicationTracker;
            appState.userProfile.medicationTracker = savedTracker;
        }
    }

    /**
     * Saves the medication settings from the modal to appState and localStorage.
     */
    function saveMedicationSettings(e) {
    e.preventDefault();

        const newMedications = [];
        medModalSettingsList.querySelectorAll('.medication-settings-item').forEach((item, index) => {
            const time = item.querySelector('.med-input-time').value;
            const name = item.querySelector('.med-input-name').value;
            if (time && name) { // Only save if both fields are filled
                newMedications.push({
                    id: `m${index + 1}`, // Create new, clean IDs
                    time: time,
                    name: name
                });
            }
        });

        appState.userProfile.medicationTracker = {
            startDate: medModalStartDate.value || null,
            duration: parseInt(medModalDuration.value, 10) || 0,
            medications: newMedications,
            log: appState.userProfile.medicationTracker.log || {} // Preserve the log
        };

        // Save to localStorage + cloud 
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);

        // Re-render the home page card
        renderMedicationTracker();

        // Close modal and show toast
        medModal.classList.add('hidden'); // Use direct class manipulation
        showToast("Medication settings saved!", "success");
    }

    // --- START: ONBOARDING LOGIC ---

    let obMedCounter = 0; // Local counter for onboarding med list

    /**
     * Populates the dynamic forms inside the onboarding modal.
     * This should run once on page load.
     */
    function setupOnboardingModal() {
        if (!obProfileDiagnoses) return; // Modal doesn't exist, stop

        // 1. Populate Profile Slide (re-using createCheckbox)
        obProfileDiagnoses.innerHTML = PROFILE_OPTIONS.diagnoses.map(i => createCheckbox(`ob-diag-${i}`, i, 'ob-diagnoses', appState.userProfile.diagnoses.includes(i))).join('');
        obProfileIntolerances.innerHTML = PROFILE_OPTIONS.intolerances.map(i => createCheckbox(`ob-intol-${i}`, i, 'ob-intolerances', appState.userProfile.intolerances.includes(i))).join('');
        obProfilePreferences.innerHTML = PROFILE_OPTIONS.preferences.map(i => createCheckbox(`ob-pref-${i}`, i, 'ob-preferences', appState.userProfile.preferences.includes(i))).join('');
        
        // 2. Populate data from existing profile (if user re-runs modal)
        obProfileAllergiesOther.value = appState.userProfile.allergiesOther || '';
        const currentPhase = appState.userProfile.currentPhase || '';
        obPhaseSelectValue.value = currentPhase;
        
        if (obPhaseSelectContainer) {
            obPhaseSelectContainer.querySelectorAll('.onboarding-phase-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.phase === currentPhase);
            });
        }
        
        // 3. Pre-fill phase settings from appState
        const ptSettings = appState.userProfile.phaseSettings["pre-treatment"];
        obPtStartDate.value = ptSettings.startDate || '';
        obPtDurationNum.value = ptSettings.durationNum || 4;
        obPtDurationUnit.value = ptSettings.durationUnit || 'weeks';
        obPtRules.value = ptSettings.rules || '';
        
        const rsSettings = appState.userProfile.phaseSettings["restriction"];
        obRsStartDate.value = rsSettings.startDate || '';
        obRsDurationNum.value = rsSettings.durationNum || 4;
        obRsDurationUnit.value = rsSettings.durationUnit || 'weeks';

        const medSettings = appState.userProfile.medicationTracker;
        obMedStartDate.value = medSettings.startDate || '';
        obMedDuration.value = medSettings.duration || 12;
        // Build med list (similar to renderMedicationSettingsList)
        if (medSettings.medications.length > 0) {
            obMedList.innerHTML = medSettings.medications.map(med => {
                const uniqueId = `ob_med_${obMedCounter++}`;
                return `
                <div class="medication-settings-item" data-id="${uniqueId}">
                    <input type="time" class="med-input-time time-input" value="${med.time}">
                    <input type="text" class="med-input-name name-input" value="${med.name}" placeholder="Medication Name">
                    <button type="button" class="medication-remove-btn">&times;</button>
                </div>
            `;
            }).join('');
        } else {
             obMedList.innerHTML = `<p class="text-xs text-subtle text-center">No medications added.</p>`;
        }
    }
    
    /**
     * Shows the onboarding modal and resets it to the first slide.
     */
    function showOnboardingModal() {
        if (!onboardingModal) return;
        
        // Reset state
        appState.onboardingHistory = ['onboarding-slide-welcome'];
        appState.currentOnboardingSlide = 0;
        appState.onboardingSetupPath = 'setup'; // Default path
        
        // Reset forms to default (in case they skipped before)
        setupOnboardingModal(); 
        
        // Show modal and first slide
        onboardingModal.classList.remove('hidden');
        goToOnboardingSlide('onboarding-slide-welcome');
    }
    
    /**
     * Closes the onboarding modal and marks it as "seen".
     */
    function closeOnboardingModal() {
        if (onboardingModal) onboardingModal.classList.add('hidden');

        // --- NEW: Mark onboarding as "seen" ---
        // This prevents the modal from showing again, even if skipped.
        if (appState.userProfile.hasCompletedOnboarding === false) {
            appState.userProfile.hasCompletedOnboarding = true;
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            saveToCloud('userProfile', appState.userProfile);
        }
    }

    /**
     * Main navigation function for the onboarding modal.
     * @param {string} targetSlideId - The ID of the slide to show.
     */
    function goToOnboardingSlide(targetSlideId) {
        // Hide all slides
        onboardingSlides.forEach(slide => slide.classList.add('hidden'));

        // Show the target slide
        const targetSlide = document.getElementById(targetSlideId);
        if (targetSlide) {
            targetSlide.classList.remove('hidden');
        }

        // --- Footer and Dots Logic ---
        onboardingDots.innerHTML = '';
        onboardingBtnBack.classList.add('hidden');
        onboardingBtnNext.classList.add('hidden');
        onboardingBtnFinish.classList.add('hidden');
        onboardingFooter.classList.remove('hidden'); // Show footer by default

        switch (targetSlideId) {
            case 'onboarding-slide-welcome':
                appState.currentOnboardingSlide = 0;
                onboardingFooter.classList.add('hidden'); // Slide 1 has its own buttons
                break;
                
            case 'onboarding-slide-know-more':
                appState.currentOnboardingSlide = 1;
                onboardingBtnBack.classList.remove('hidden');
                onboardingBtnNext.classList.remove('hidden');
                onboardingDots.innerHTML = `<div class="dot active"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
                break;
                
            case 'onboarding-slide-profile':
                appState.currentOnboardingSlide = 2;
                onboardingBtnBack.classList.remove('hidden');
                onboardingBtnNext.classList.remove('hidden');
                onboardingDots.innerHTML = `<div class="dot"></div><div class="dot active"></div><div class="dot"></div><div class="dot"></div>`;
                break;
                
            case 'onboarding-slide-phase-select':
                appState.currentOnboardingSlide = 3;
                onboardingBtnBack.classList.remove('hidden');
                onboardingBtnNext.classList.remove('hidden');
                // Disable 'Next' until a phase is selected
                onboardingBtnNext.disabled = !obPhaseSelectValue.value;
                onboardingBtnNext.style.opacity = obPhaseSelectValue.value ? '1' : '0.5';
                onboardingDots.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot active"></div><div class="dot"></div>`;
                break;
                
            case 'onboarding-slide-phase-setup':
                appState.currentOnboardingSlide = 4;
                onboardingBtnBack.classList.remove('hidden');
                onboardingBtnFinish.classList.remove('hidden'); // Show Finish
                onboardingDots.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot active"></div>`;
                
                // Show the correct sub-content
                const phase = obPhaseSelectValue.value;
                onboardingPhaseContent.forEach(content => content.classList.add('hidden')); // Keep this line to hide all setups
                
                let targetContent;
                switch (phase) {
                    case 'pre-treatment':
                        targetContent = document.getElementById('onboarding-setup-pre-treatment');
                        break;
                    case 'restriction':
                        targetContent = document.getElementById('onboarding-setup-restriction');
                        break;
                    case 'reintroduction':
                        targetContent = document.getElementById('onboarding-setup-reintroduction');
                        break;
                    case 'personalization':
                        targetContent = document.getElementById('onboarding-setup-personalization');
                        break;
                }
                if (targetContent) targetContent.classList.remove('hidden');
                break;
        }
    }
    
    /**
     * Reads all form data from the onboarding modal and saves it to appState.
     */
    function saveOnboardingData() {
        // 1. Save Profile Data (Slide 3)
        appState.userProfile.diagnoses = Array.from(document.querySelectorAll('input[name="ob-diagnoses"]:checked')).map(el => el.value); 
        appState.userProfile.intolerances = Array.from(document.querySelectorAll('input[name="ob-intolerances"]:checked')).map(el => el.value); 
        appState.userProfile.preferences = Array.from(document.querySelectorAll('input[name="ob-preferences"]:checked')).map(el => el.value); 
        appState.userProfile.allergiesOther = toTitleCase(obProfileAllergiesOther.value.trim());

        // 2. Save Selected Phase (Slide 4)
        const selectedPhase = obPhaseSelectValue.value;
        if (selectedPhase) {
            appState.userProfile.currentPhase = selectedPhase;
        }

        // 3. Save Dynamic Phase Settings (Slide 5)
        switch (selectedPhase) {
            case 'pre-treatment':
                appState.userProfile.phaseSettings["pre-treatment"] = {
                    startDate: obPtStartDate.value || null,
                    durationNum: parseInt(obPtDurationNum.value, 10) || 4,
                    durationUnit: obPtDurationUnit.value,
                    rules: obPtRules.value
                };
                break;
            case 'restriction':
                appState.userProfile.phaseSettings["restriction"] = {
                    startDate: obRsStartDate.value || null,
                    durationNum: parseInt(obRsDurationNum.value, 10) || 4,
                    durationUnit: obRsDurationUnit.value
                };
                
                // Save medication settings
                const newMedications = [];
                obMedList.querySelectorAll('.medication-settings-item').forEach((item, index) => {
                    const time = item.querySelector('.med-input-time').value;
                    const name = item.querySelector('.med-input-name').value;
                    if (time && name) {
                        newMedications.push({ id: `m${index + 1}`, time: time, name: name });
                    }
                });
                
                appState.userProfile.medicationTracker = {
                    startDate: obMedStartDate.value || null,
                    duration: parseInt(obMedDuration.value, 10) || 0,
                    medications: newMedications,
                    log: {} // Start with a fresh log
                };
                break;
        }
        
        // 4. Mark onboarding as complete
        appState.userProfile.hasCompletedOnboarding = true;
        
        // 5. Save everything to localStorage + cloud 
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        saveToCloud('userProfile', appState.userProfile);

        // 6. Refresh the app UI
        updateUiForPhase(appState.userProfile.currentPhase);
        setupProfilePage(); // Sync the main profile page with new data
        
        showToast("Welcome! Your profile is all set.", appState.userProfile.currentPhase);
    }

    // --- END: ONBOARDING LOGIC ---

    /**
     * Renders the "Today's Medication" card on the Home screen.
     */
    function renderMedicationTracker() {
    if (!medicationTrackerCard) return;

    const tracker = appState.userProfile.medicationTracker;
    const hasSettings = tracker.startDate && tracker.duration > 0 && tracker.medications.length > 0;

    let isActive = false;
    if (hasSettings) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(tracker.startDate + 'T00:00:00');

        const timeDiff = today.getTime() - start.getTime();
        const daysElapsed = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

        // Check if we are within the duration window
        isActive = (daysElapsed >= 0 && daysElapsed < tracker.duration);
    }

    // Show the whole tracker card (it contains both states)
    medicationTrackerCard.classList.remove('hidden');

    if (isActive) {
        // --- RENDER FULL STATE ---
        medicationTrackerFull.classList.remove('hidden');
        medicationTrackerEmpty.classList.add('hidden');

        const todayKey = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
        const takenToday = tracker.log[todayKey] || [];

        medicationChecklist.innerHTML = tracker.medications.map(med => {
            const isChecked = takenToday.includes(med.id);
            return `
                <div class="medication-checklist-item">
                    <input type="checkbox" id="med-${med.id}" data-id="${med.id}" ${isChecked ? 'checked' : ''}>
                    <label for="med-${med.id}">
                        <span class="time">${med.time}</span> - ${med.name}
                    </label>
                </div>
            `;
        }).join('');

        // 4. Render Log History (simple version)
        const logKeys = Object.keys(tracker.log).sort().reverse(); // Newest first
        if (logKeys.length === 0) {
            medicationLogHistory.innerHTML = `<p class="text-center italic">No history yet.</p>`;
        } else {
            medicationLogHistory.innerHTML = logKeys.slice(0, 10).map(dateKey => { // Show last 10 days
                const takenCount = tracker.log[dateKey].length;
                const totalCount = tracker.medications.length;
                const dateString = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return `<p><strong>${dateString}:</strong> Took ${takenCount} of ${totalCount} doses.</p>`;
            }).join('');
        }
    } else {
        // --- RENDER EMPTY STATE ---
        // (Or "finished" state)
        medicationTrackerFull.classList.add('hidden');
        medicationTrackerEmpty.classList.remove('hidden');
    }
}

    // --- Wire up all Medication Tracker listeners ---
    if (medModal) {
        // Settings cog on the home card
        document.getElementById('medication-settings-btn').addEventListener('click', showMedicationSettings);

        // "Set Up" button on the empty state card
        document.getElementById('medication-setup-btn').addEventListener('click', showMedicationSettings);

        // Modal close/cancel
        medModalClose.addEventListener('click', closeMedicationSettings);
        medModalCancel.addEventListener('click', closeMedicationSettings);

        // Modal save
        medModalForm.addEventListener('submit', saveMedicationSettings);

        // Add new medication row in modal
        medModalAddBtn.addEventListener('click', () => {
            const newId = `temp_${appState.currentMedicationIdCounter++}`;
            const item = document.createElement('div');
            item.className = 'medication-settings-item';
            item.dataset.id = newId;
            item.innerHTML = `
                <input type="time" class="med-input-time time-input" value="09:00">
                <input type="text" class="med-input-name name-input" placeholder="Medication Name">
                <button type="button" class="medication-remove-btn">&times;</button>
            `;

            // Clear the "empty" message if it's there
            if (medModalSettingsList.querySelector('p')) {
                medModalSettingsList.innerHTML = '';
            }
            medModalSettingsList.appendChild(item);
            item.querySelector('.med-input-name').focus();
        });

        // Remove medication row in modal (using delegation)
        medModalSettingsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('medication-remove-btn')) {
                e.target.closest('.medication-settings-item').remove();

                // Check if list is now empty
                if (medModalSettingsList.children.length === 0) {
                    medModalSettingsList.innerHTML = `<p class="text-xs text-subtle text-center">No medications added.</p>`;
                }
            }
        });

        // Checklist on home card (using delegation)
        medicationChecklist.addEventListener('change', (e) => {
            if (e.target.matches('input[type="checkbox"]')) {
                const medId = e.target.dataset.id;
                const todayKey = new Date().toLocaleDateString('en-CA');

                // Ensure the log array exists for today
                if (!appState.userProfile.medicationTracker.log[todayKey]) {
                    appState.userProfile.medicationTracker.log[todayKey] = [];
                }

                const takenList = appState.userProfile.medicationTracker.log[todayKey];

                if (e.target.checked) {
                    // Add to list if not already present
                    if (!takenList.includes(medId)) {
                        takenList.push(medId);
                    }
                    // Apply line-through style via label
                    e.target.nextElementSibling.classList.add('strikethrough'); 
                } else {
                    // Remove from list
                    appState.userProfile.medicationTracker.log[todayKey] = takenList.filter(id => id !== medId);
                    // Remove line-through style via label
                    e.target.nextElementSibling.classList.remove('strikethrough');
                }

                // Save changes to localStorage + cloud
                localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                saveToCloud('userProfile', appState.userProfile);

                // Re-render the log history (but not the whole card)
                const logKeys = Object.keys(appState.userProfile.medicationTracker.log).sort().reverse();
                medicationLogHistory.innerHTML = logKeys.slice(0, 10).map(dateKey => {
                    const takenCount = appState.userProfile.medicationTracker.log[dateKey].length;
                    const totalCount = appState.userProfile.medicationTracker.medications.length;
                    const dateString = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return `<p><strong>${dateString}:</strong> Took ${takenCount} of ${totalCount} doses.</p>`;
                }).join('');
            }
        });
    }

    // --- NEW: Food Edit Modal Controller ---
    let currentEditingFoodId = null; // State for the modal

    /**
     * Populates and shows the Food Edit Modal.
     * @param {number | null} foodId - The ID of the food to edit, or null to create a new one.
     * @param {boolean} [startInEditMode=false] - If true, opens directly to the edit form.
     */
    function showFoodModal(foodId = null, startInEditMode = false) {
        currentEditingFoodId = foodId; // Set the state

        // 1. Populate the Group Selector (we only need to do this once)
        if (foodModalGroup.options.length === 0) {
            // --- NEW: Add a blank "No Group" option ---
            const defaultOption = new Option("Assign a group (Optional)", "");
            foodModalGroup.add(defaultOption);
            
            FODMAP_GROUP_DATA.forEach(group => {
                if (group.value !== "Restriction") {
                    const option = new Option(`${FODMAP_STYLES[group.value].icon} ${group.name}`, group.value);
                    foodModalGroup.add(option);
                }
            });
        }
        
        // --- Get new dose logic UI elements ---
        const doseTriggerTolerated = document.getElementById('food-modal-dose-trigger-tolerated');
        const doseTriggerTrigger = document.getElementById('food-modal-dose-trigger-trigger');
        const doseWrapper = document.getElementById('food-modal-dose-wrapper');

        if (foodId === null || startInEditMode) {
            // --- MODE: NEW or EDIT ---
            let foodData = {};
            
            if (foodId !== null) {
                // Editing existing food
                foodModalTitle.textContent = 'Edit Food';
                foodData = appState.userProfile.personalizationFoods.find(f => f.id === foodId);
            } else {
                // Creating new food
                foodModalTitle.textContent = 'Add New Food';
                // --- UPDATED DEFAULTS ---
                foodData = { name: '', group: '', status: '', doseLogic: null, dose: '', notes: '' };
            }
            
            // Populate the form fields
            foodModalName.value = foodData.name;
            foodModalGroup.value = foodData.group || ''; // Handle null/undefined group
            foodModalNotes.value = foodData.notes;
            foodModalDose.value = foodData.dose;

            // Set status toggles (Request #1)
            foodModalBtnTolerated.classList.toggle('active', foodData.status === 'tolerated');
            foodModalBtnTrigger.classList.toggle('active', foodData.status === 'trigger');
            foodModalStatus.value = foodData.status;
            
            // --- NEW DOSE LOGIC (Request #3) ---
            if (foodData.status) {
                foodModalDoseLogicContainer.classList.remove('hidden');
            } else {
                foodModalDoseLogicContainer.classList.add('hidden');
            }

            // Set dose logic toggles/inputs
            foodModalDoseLogic.value = foodData.doseLogic;
            
            if (foodData.doseLogic) {
                // Dose logic exists, so show the input field
                doseWrapper.style.display = 'block';
                doseTriggerTolerated.classList.add('hidden');
                doseTriggerTrigger.classList.add('hidden');
            } else {
                // No dose logic, show the correct trigger button
                doseWrapper.style.display = 'none';
                doseTriggerTolerated.classList.toggle('hidden', foodData.status !== 'tolerated');
                doseTriggerTrigger.classList.toggle('hidden', foodData.status !== 'trigger');
            }
            // --- END NEW DOSE LOGIC ---

            // Show/Hide panes
            foodModalView.classList.add('hidden');
            foodModalEdit.classList.remove('hidden');
            
        } else {
            // --- MODE: VIEW ---
            const foodData = appState.userProfile.personalizationFoods.find(f => f.id === foodId);
            if (!foodData) return; // Safety check

            foodModalTitle.textContent = 'View Food';
            
            // Build the view HTML
            
            // --- 1. Food Name ---
            let foodHTML = `
                <div class="food-modal-view-item">
                    <span class="label"><b>Food:</b></span>
                    <span class="value">${foodData.name}</span>
                </div>`;

            // --- 2. Group (Optional) ---
            const groupInfo = FODMAP_GROUP_DATA.find(g => g.value === foodData.group);
            let groupHTML = '';
            if (groupInfo) {
                const style = FODMAP_STYLES[foodData.group] || { icon: '❓' };
                groupHTML = `
                <div class="food-modal-view-item">
                    <span class="label"><b>Group:</b></span>
                    <span class="value">${style.icon} ${groupInfo.name}</span>
                </div>`;
            }
            
            // --- 3. Status (Exception: This one IS bold) ---
            let statusHTML = '';
            if (foodData.status === 'tolerated') {
                statusHTML = `<strong class="text-accent">Tolerated</strong>`;
            } else {
                statusHTML = `<strong class="text-error">Trigger</strong>`;
            }
            let statusBlockHTML = `
                <div class="food-modal-view-item">
                    <span class="label"><b>Status:</b></span>
                    ${statusHTML}
                </div>`;
            
            // --- 4. Dose (Optional, Request #3, #4) ---
            let doseHTML = '';
            if (foodData.doseLogic) {
                // Use "Up to" / "Starting at" (lowercase)
                const logicText = foodData.doseLogic === 'up to' ? 'Up to' : 'Starting at';
                doseHTML = `
                <div class="food-modal-view-item">
                    <span class="label"><b>Dose:</b></span>
                    <span class="value">${logicText} ${foodData.dose}</span>
                </div>`;
            }

            // --- 5. Notes (Optional) ---
            let notesHTML = '';
            if (foodData.notes) {
                // Apply the .notes-item class to the parent div
                notesHTML = `
                <div class="food-modal-view-item notes-item">
                    <span class="label"><b>Notes</b></span>
                    <span class="value">${foodData.notes}</span>
                </div>`;
            }

            // --- 6. Combine all blocks ---
            foodModalViewContent.innerHTML = `
                <div class="space-y-2">
                    ${foodHTML}
                    ${groupHTML}
                    ${statusBlockHTML}
                    ${doseHTML}
                    ${notesHTML}
                </div>
            `;
            
            // Show/Hide panes
            foodModalView.classList.remove('hidden');
            foodModalEdit.classList.add('hidden');
        }

        // Finally, show the main modal
        foodModal.classList.remove('hidden');
    }

    /**
     * Closes the Food Edit Modal and resets its state.
     */
    function closeFoodModal() {
        foodModal.classList.add('hidden');
        currentEditingFoodId = null;
        // Reset form to avoid showing old data
        foodModalEdit.reset();
        foodModalStatus.value = '';
        foodModalDoseLogic.value = '';
    }

    // --- Log Entry Modal Listeners ---
    logModalClose.addEventListener('click', closeLogModal);
    logFormCancelBtn.addEventListener('click', closeLogModal);

    // --- Onboarding Modal Listeners ---
    if (onboardingModal) {
        onboardingModalClose.addEventListener('click', closeOnboardingModal);
        openOnboardingBtn.addEventListener('click', () => {
            closeSide(); // Close side menu
            showOnboardingModal(); // Show onboarding
        });

        // Slide 1: Welcome
        onboardingActionSetup.addEventListener('click', () => {
            appState.onboardingSetupPath = 'setup';
            appState.onboardingHistory.push('onboarding-slide-profile');
            goToOnboardingSlide('onboarding-slide-profile');
        });
        onboardingActionKnowMore.addEventListener('click', () => {
            appState.onboardingSetupPath = 'knowMore';
            appState.onboardingHistory.push('onboarding-slide-know-more');
            goToOnboardingSlide('onboarding-slide-know-more');
        });

        // Footer: Navigation
        onboardingBtnSkip.addEventListener('click', closeOnboardingModal);
        
        onboardingBtnBack.addEventListener('click', () => {
            appState.onboardingHistory.pop(); // Remove current slide
            const prevSlide = appState.onboardingHistory[appState.onboardingHistory.length - 1]; // Get previous
            if (prevSlide) {
                goToOnboardingSlide(prevSlide);
            }
        });
        
        onboardingBtnNext.addEventListener('click', () => {
            let nextSlideId = '';
            const currentSlide = appState.onboardingHistory[appState.onboardingHistory.length - 1];
            
            if (currentSlide === 'onboarding-slide-know-more') {
                nextSlideId = 'onboarding-slide-profile';
            } else if (currentSlide === 'onboarding-slide-profile') {
                nextSlideId = 'onboarding-slide-phase-select';
            } else if (currentSlide === 'onboarding-slide-phase-select') {
                nextSlideId = 'onboarding-slide-phase-setup';
            }
            
            if (nextSlideId) {
                appState.onboardingHistory.push(nextSlideId);
                goToOnboardingSlide(nextSlideId);
            }
        });
        
        onboardingBtnFinish.addEventListener('click', () => {
            saveOnboardingData();
            closeOnboardingModal();
        });
        
        // Slide 4: Phase Select
        if (obPhaseSelectContainer) {
            obPhaseSelectContainer.addEventListener('click', (e) => {
                const clickedButton = e.target.closest('.onboarding-phase-btn');
                if (!clickedButton) return;

                const phase = clickedButton.dataset.phase;

                // 1. Set the hidden input value
                obPhaseSelectValue.value = phase;

                // 2. Update button active states
                obPhaseSelectContainer.querySelectorAll('.onboarding-phase-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                clickedButton.classList.add('active');

                // 3. Enable the 'Next' button
                onboardingBtnNext.disabled = false;
                onboardingBtnNext.style.opacity = '1';
            });
        }

        // Slide 5: Medication List
        obMedAddBtn.addEventListener('click', () => {
            const newId = `ob_med_${obMedCounter++}`;
            const item = document.createElement('div');
            item.className = 'medication-settings-item';
            item.dataset.id = newId;
            item.innerHTML = `
                <input type="time" class="med-input-time time-input" value="09:00">
                <input type="text" class="med-input-name name-input" placeholder="Medication Name">
                <button type="button" class="medication-remove-btn">&times;</button>
            `;
            if (obMedList.querySelector('p')) {
                obMedList.innerHTML = '';
            }
            obMedList.appendChild(item);
            item.querySelector('.med-input-name').focus();
        });

        obMedList.addEventListener('click', (e) => {
            if (e.target.classList.contains('medication-remove-btn')) {
                e.target.closest('.medication-settings-item').remove();
                if (obMedList.children.length === 0) {
                    obMedList.innerHTML = `<p class="text-xs text-subtle text-center">No medications added.</p>`;
                }
            }
        });
    }

    // --- NEW: Food Edit Modal Listeners ---
    foodModalClose.addEventListener('click', closeFoodModal);
    foodModalCancelBtn.addEventListener('click', closeFoodModal);


    // Switch from View to Edit mode
    foodModalEditBtn.addEventListener('click', () => {
        showFoodModal(currentEditingFoodId, true); // Re-open in edit mode
    });
    
    // --- UPDATED: Status Toggles (Request #3) ---
    foodModalBtnTolerated.addEventListener('click', () => {
        foodModalStatus.value = 'tolerated';
        foodModalBtnTolerated.classList.add('active'); // CSS handles color
        foodModalBtnTrigger.classList.remove('active');
        
        // Show container and correct button
        foodModalDoseLogicContainer.classList.remove('hidden');
        document.getElementById('food-modal-dose-trigger-tolerated').classList.remove('hidden');
        document.getElementById('food-modal-dose-trigger-trigger').classList.add('hidden');
        
        // Reset dose fields
        document.getElementById('food-modal-dose-wrapper').style.display = 'none';
        foodModalDoseLogic.value = '';
        foodModalDose.value = '';
    });
    foodModalBtnTrigger.addEventListener('click', () => {
        foodModalStatus.value = 'trigger';
        foodModalBtnTolerated.classList.remove('active');
        foodModalBtnTrigger.classList.add('active'); // CSS handles color

        // Show container and correct button
        foodModalDoseLogicContainer.classList.remove('hidden');
        document.getElementById('food-modal-dose-trigger-tolerated').classList.add('hidden');
        document.getElementById('food-modal-dose-trigger-trigger').classList.remove('hidden');

        // Reset dose fields
        document.getElementById('food-modal-dose-wrapper').style.display = 'none';
        foodModalDoseLogic.value = '';
        foodModalDose.value = '';
    });

    // --- NEW: Dose Logic Trigger Button Listeners (Request #3) ---
    document.getElementById('food-modal-dose-trigger-tolerated').addEventListener('click', () => {
        foodModalDoseLogic.value = 'up to';
        document.getElementById('food-modal-dose-wrapper').style.display = 'block';
        document.getElementById('food-modal-dose-trigger-tolerated').classList.add('hidden');
        foodModalDose.focus();
    });
    
    document.getElementById('food-modal-dose-trigger-trigger').addEventListener('click', () => {
        foodModalDoseLogic.value = 'starting at';
        document.getElementById('food-modal-dose-wrapper').style.display = 'block';
        document.getElementById('food-modal-dose-trigger-trigger').classList.add('hidden');
        foodModalDose.focus();
    });

    // --- NEW: Dose Clear Button Listener (Request #3) ---
    document.getElementById('food-modal-dose-clear-btn').addEventListener('click', () => {
        // Clear values
        foodModalDoseLogic.value = '';
        foodModalDose.value = '';
        
        // Hide input
        document.getElementById('food-modal-dose-wrapper').style.display = 'none';

        // Show the correct trigger button based on status
        if (foodModalStatus.value === 'tolerated') {
            document.getElementById('food-modal-dose-trigger-tolerated').classList.remove('hidden');
        } else if (foodModalStatus.value === 'trigger') {
            document.getElementById('food-modal-dose-trigger-trigger').classList.remove('hidden');
        }
    });

    // --- NEW: Modal Main Action - DELETE ---
    foodModalDeleteBtn.addEventListener('click', () => {
        if (currentEditingFoodId === null) return; // Should never happen, but safety first
        
        // --- FIX: Get food data directly from state, not the (hidden) form input ---
        const foodData = appState.userProfile.personalizationFoods.find(f => f.id === currentEditingFoodId);
        if (!foodData) return; // Food not found

        showActionModal({
            title: 'Delete Food',
            message: `Are you sure you want to delete "${foodData.name}"? This cannot be undone.`,
            confirmText: 'Delete',
            onConfirm: () => {
                const foodIdToDelete = currentEditingFoodId;
                
                // 1. Delete from local state
                const indexToDelete = appState.userProfile.personalizationFoods.findIndex(
                    food => food.id === foodIdToDelete
                );
                if (indexToDelete > -1) {
                    appState.userProfile.personalizationFoods.splice(indexToDelete, 1);
                }
                
                // 2. Delete from cloud
                deleteFoodFromCloud(foodIdToDelete); // Async

                // 3. Save local user profile & re-render
                localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
                saveToCloud('userProfile', appState.userProfile); // Save main settings
                renderPersonalizationSummary();
                closeFoodModal();
                showToast("Food deleted.", "success");
            }
        });
    });

    // --- NEW: Modal Main Action - SAVE ---
    /**
     * Helper function to save (create or update) a food item.
     * This is called *after* all validation has passed.
     */
    function saveFoodData() {
        // 1. Get all the data from the form
        const newFoodData = {
            id: currentEditingFoodId || Date.now(), // Use existing ID or create new one
            name: toTitleCase(foodModalName.value.trim()),
            group: foodModalGroup.value || null,
            status: foodModalStatus.value,
            doseLogic: foodModalDoseLogic.value || null, // Save null if empty
            dose: foodModalDose.value.trim(),
            notes: foodModalNotes.value.trim()
        };

        // 2. Validate required fields (This is a final check)
        if (!newFoodData.name || !newFoodData.status) {
            showToast("Please fill in all required fields (*).", "warning");
            return; // Should be impossible if validation passed, but good for safety
        }

        if (currentEditingFoodId) {
            // --- UPDATE EXISTING FOOD ---
            
            // 1. Update in local state
            const indexToUpdate = appState.userProfile.personalizationFoods.findIndex(
                food => food.id === currentEditingFoodId
            );
            if (indexToUpdate > -1) {
                appState.userProfile.personalizationFoods[indexToUpdate] = newFoodData;
            }
            
            // 2. Update in cloud
            updateFoodInCloud(currentEditingFoodId, newFoodData); // Async
            
        } else {
            // --- ADD NEW FOOD ---
            
            // 1. Add to local state
            appState.userProfile.personalizationFoods.push(newFoodData);
            
            // 2. Add to cloud
            addFoodToCloud(newFoodData); // Async
        }

        // 3. Save user profile (local) and re-render
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        // We only save the userProfile (settings) to the *main* doc
        saveToCloud('userProfile', appState.userProfile);
        
        // 4. Close modal, re-render Home, and show toast
        closeFoodModal();
        renderPersonalizationSummary();
        showToast("Food saved!", "success");
    }

    // --- NEW: Modal Main Action - SAVE (with Validation) ---
    foodModalEdit.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop the form from reloading the page

        const newName = foodModalName.value.trim();
        const newNameLower = newName.toLowerCase();
        const currentId = currentEditingFoodId; // null if new

        // 1. Check for required fields *first*
        if (!newName || !foodModalStatus.value) {
            showToast("Please fill in all required fields (*).", "warning");
            return;
        }

        // 2. Check for EXACT duplicate
        const exactMatch = appState.userProfile.personalizationFoods.find(
            food => food.name.toLowerCase() === newNameLower && food.id !== currentId
        );

        if (exactMatch) {
            showToast(`Error: "${exactMatch.name}" is already in your list.`, "warning");
            return; // Stop the save
        }

        // 3. Check for FUZZY "includes" match
        const similarFoods = appState.userProfile.personalizationFoods.filter(food => {
            if (food.id === currentId) return false; // Don't compare against self
            
            const existingNameLower = food.name.toLowerCase();
            
            // Avoid simple plurals being "included" in their singular form
            // e.g., "apples" includes "apple", but we also check if "apple" includes "apples" (false)
            if (newNameLower.length > existingNameLower.length) {
                return newNameLower.includes(existingNameLower);
            } else {
                return existingNameLower.includes(newNameLower);
            }
        });

        if (similarFoods.length > 0) {
            // Found a fuzzy match, ask the user
            showActionModal({
                title: 'Wait, Similar Food Found',
                message: `You are adding "${newName}", which is similar to "${similarFoods[0].name}" in your list. Are they different foods?`,
                confirmText: 'Add as New Food',
                onConfirm: () => {
                    saveFoodData(); // User confirmed, proceed with save
                },
                cancelText: 'Cancel'
                // onCancel does nothing, just closes the modal
            });
        } else {
            // No duplicates and no fuzzy matches, save immediately
            saveFoodData();
        }
    });

    const openGemini = (title) => { geminiTitle.textContent = title; geminiMdl.classList.remove('hidden'); geminiLoader.classList.remove('hidden'); geminiContent.classList.add('hidden'); geminiError.classList.add('hidden'); }; const closeGemini = () => geminiMdl.classList.add('hidden'); geminiClose.addEventListener('click', closeGemini);
    const callGeminiAPI = async (prompt, imgData = null, mimeType = null) => { // <--- ACCEPT MIME TYPE
        if (!functions) {
            showToast("AI features unavailable offline.", "error");
            return null;
        }
        const analyzeFodmap = functions.httpsCallable('analyzeFodmap');

        try {
            const result = await analyzeFodmap({ 
                text: prompt, 
                image: imgData,
                mimeType: mimeType // <--- SEND TO BACKEND
            });
            
            return result.data.text; 

        } catch (err) {
            console.error("Cloud Function failed:", err);
            
            // 1. Check for Limit Reached (Code or Message)
            if (err.code === 'resource-exhausted' || (err.message && err.message.includes('limit'))) {
                showActionModal({
                    title: 'Free Limit Reached',
                    message: "You've reached the limit of 5 free AI requests.\n\nUpgrade to Premium for unlimited access to the AI Assistant tools!",
                    confirmText: 'Go Premium',
                    onConfirm: () => {
                       // Future: Redirect to payment or open premium modal
                       showToast("Premium flow coming soon!", "success");
                    },
                    cancelText: 'Not Now'
                });
                return null;
            }

            // 2. Handle Auth Error (Covers "unauthenticated" code OR the specific error message you saw)
            if (err.code === 'unauthenticated' || (err.message && err.message.includes('logged in'))) {
                showToast("Please log in or create a free account to use the AI features.", "warning");
                // Optional: Automatically open the login modal for better UX
                openAuthModal('login'); 
            } else {
                // Show the actual error message for better debugging
                showToast(`AI Error: ${err.message || "Service unavailable"}`, "error");
            }
            return null;
        }
    };
    document.getElementById('summarize-journey-btn').addEventListener('click', async () => {
        if (appState.logEntries.length === 0) { showToast("Need logs.", "warning"); return; } 
        openGemini('✨ Summary'); 
        const logTxt = appState.logEntries.map(e => `Date:${e.date},Grp:${e.group},Food:${e.food},Dose:${e.dose},Sym:${e.symptom==='Other'?e.otherSymptom:e.symptom},Sev:${e.severity}/5`).join('; '); 
        
        // 1. UPDATED PROMPT:
        const prompt = `FODMAP helper. No medical advice. Analyze log.
        Profile: ${buildProfileContext()}. Log: ${logTxt}

        Use this exact template:
        **Overall Observation:** [1-2 sentence gentle observation on patterns.]
        **Potential Triggers:** [Bulleted list of foods/groups with consistent severity 3-5. If none, say "No clear triggers noted yet."]
        **Seemingly Well-Tolerated:** [Bulleted list of foods/groups with consistent "None" or severity 1-2. If none, say "Keep logging to find your safe foods."]

        Format: **bold** headings, *italics*, newlines, bullets (- or *).
        No '###', '|', tables, or disclaimer.`

                        const summary = await callGeminiAPI(prompt); 
                        geminiLoader.classList.add('hidden'); 
                        if (summary === null) { geminiMdl.classList.add('hidden'); return; } 
                        
                        // 2. FIXED PARSER:
                        if (summary) { 
                            // Add the same parser we use for the AI assistant
                            let html = summary
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')   // Bold
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italics
                                .replace(/(\n|^)[\-\*] (.*?)(?=\n|$)/g, '<br>• $2') // Bullets
                                .replace(/\n/g, '<br>'); // Newlines
                            geminiContent.innerHTML = html; // Use .innerHTML, not .textContent
                            geminiContent.classList.remove('hidden'); 
                        } else { 
                            geminiError.textContent = 'Summary failed.'; 
                            geminiError.classList.remove('hidden'); 
                        }
                    });
    document.getElementById('plan-challenge-btn').addEventListener('click', async () => {
        const sel = document.getElementById('log-fodmap-group'); 
        const val = sel.value; // This gets the clean value, e.g., "Fructose"
        if (!val) { showToast("Select group.", "warning"); return; } 
        
        // 1. Use `val` for the modal title, not the full text
        openGemini(`✨ ${val} Plan`); 

        // 2. Use `val` in the prompt for a cleaner request
        const prompt = `FODMAP helper. No medical advice. Profile: ${buildProfileContext()}.
        Create a 3-day reintroduction challenge plan for '${val}'.

        Use this exact template:
        **Foods:** [List 2 specific foods for the challenge.]
        *Why these foods?:* [Briefly explain why they are good test foods (e.g., "purely this FODMAP").]
        *Other options:* [Suggest 1-2 alternative foods for variety.]

        **Challenge Plan:**
        - **Day 1:** [1/2 Portion]
        - **Day 2:** [1 Portion]
        - **Day 3:** [1,5 Portion]

        **After Day 3:** Wait 2-3 "washout" days and log any delayed symptoms before starting your next challenge.

        Format: **bold** headings, *italics*, newlines, bullets (- or *).
        No '###', '|', tables, or disclaimer.`;

        const plan = await callGeminiAPI(prompt); 
        geminiLoader.classList.add('hidden'); 
        if (plan === null) { geminiMdl.classList.add('hidden'); return; } 
        
        // 3. Use the full parser to render HTML
        if (plan) { 
            let html = plan
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')   // Bold
                .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italics
                .replace(/(\n|^)[\-\*] (.*?)(?=\n|$)/g, '<br>• $2') // Bullets
                .replace(/\n/g, '<br>'); // This line is now correct
            geminiContent.innerHTML = html; // Use .innerHTML
            geminiContent.classList.remove('hidden'); 
        } else { 
            geminiError.textContent = 'Plan failed.'; 
            geminiError.classList.remove('hidden'); 
        }
    });

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the default browser prompt from appearing
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Show our custom install button in the menu
        if (installAppLi) {
            installAppLi.style.display = 'block'; // Make the list item visible
        }
    });

    // Add click listener to our custom install button
    if (installAppBtn) {
        installAppBtn.addEventListener('click', () => {
            // Hide the button in the menu
            if (installAppLi) {
                installAppLi.style.display = 'none';
            }
            // Show the browser's installation prompt
            if (deferredPrompt) {
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the install prompt');
                    } else {
                        console.log('User dismissed the install prompt');
                    }
                    // Clear the deferredPrompt variable, as it can only be used once
                    deferredPrompt = null;
                });
            }
            // Close the side menu after clicking
            closeSide();
        });
    }

    // Listen for the 'appinstalled' event to know when the user has successfully installed
    window.addEventListener('appinstalled', () => {
        console.log('PWA was successfully installed!');
        // Hide the button if the app is installed
        if (installAppLi) {
            installAppLi.style.display = 'none';
        }
        deferredPrompt = null;
    });

    // Hide the button if the app is already running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        if (installAppLi) {
            installAppLi.style.display = 'none';
        }
    }

    setupLogForm(); // Set up listeners in the (hidden) log modal
    document.getElementById('log-date').valueAsDate = new Date(); // Set default date in log modal

    // --- REMOVED setupProfilePage() and updateUiForPhase() ---
    // All rendering is now handled *exclusively* by the onAuthStateChanged
    // listener, which is the single source of truth for whether the
    // user is a guest (loads from localStorage) or logged in (loads from cloud).

    // --- Global click listener to close popups ---
    // --- Calculate Padding ---
    // Run on DOM load for a fast first paint
    calculatePadding(); 
    // Run on Window load to correct for image/asset loading
    window.addEventListener('load', calculatePadding); 
    // Run on resize
    window.addEventListener('resize', calculatePadding);

    // --- Swipe Navigation ---
    const mainContent = document.getElementById('content');
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    mainContent.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    mainContent.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const minSwipeDistance = 50; // Minimum pixels for a swipe

        // Check for horizontal swipe and ignore vertical scrolls
        if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaY) < minSwipeDistance) {
            if (deltaX > 0) {
                // Swipe Right (Go to Previous Tab)
                goToPrevTab();
            } else {
                // Swipe Left (Go to Next Tab)
                goToNextTab();
            }
        }
    }

    /**
     * Renders a multi-line chart dynamically scaled to the first and last
     * symptomatic days within the last 14-day lookback window.
     */
    function renderSymptomChart() {
        const container = document.getElementById('chart-container');
        if (!container) return;

        // 1. Destroy old chart instance if it exists
        if (symptomChart) {
            symptomChart.destroy();
            symptomChart = null;
        }

        // 2. Find all symptomatic entries in the last 14 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lookbackDate = new Date(today);
        lookbackDate.setDate(today.getDate() - 13); // 14-day window
        const lookbackDateKey = lookbackDate.toLocaleDateString('en-CA');

        const symptomEntries = appState.logEntries.filter(entry => 
            hasSymptoms(entry) && entry.date >= lookbackDateKey
        );

        // 3. If no symptoms in the window, show a friendly message
        if (symptomEntries.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full py-8 text-center opacity-70">
                    <i class="fas fa-smile-beam text-4xl text-accent mb-2"></i>
                    <p class="text-sm font-semibold text-secondary">No recent symptoms!</p>
                    <p class="text-xs text-subtle">No symptoms logged in the past 14 days.</p>
                </div>
            `;
            return; 
        }

        // Restore canvas if missing (it might have been replaced by the message previously)
        if (!document.getElementById('symptom-chart')) {
            container.innerHTML = '<canvas id="symptom-chart"></canvas>';
        }
        const ctx = document.getElementById('symptom-chart');

        // 4. Find the first and last symptom date from this list
        symptomEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstSymptomDate = new Date(symptomEntries[0].date + 'T00:00:00');
        const lastSymptomDate = new Date(symptomEntries[symptomEntries.length - 1].date + 'T00:00:00');

        // 5. Build the dynamic date keys and labels
        const chartLabels = [];
        const dateKeys = [];
        let currentDate = new Date(firstSymptomDate);

        while (currentDate <= lastSymptomDate) {
            dateKeys.push(currentDate.toLocaleDateString('en-CA'));
            chartLabels.push(currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // 6. Create the nested Map: { "Fructose" => { "2025-11-01": 0, ... }, ... }
        const groupMaxSeverity = new Map();
        FODMAP_GROUP_DATA.forEach(group => {
            if (group.value === "Restriction") return; // Skip

            const dayMap = new Map();
            dateKeys.forEach(key => dayMap.set(key, 0)); // Init all days in our new range
            groupMaxSeverity.set(group.value, dayMap);
        });

        // 7. Process ONLY log entries that fall within our new dynamic date range
        const firstDateKey = dateKeys[0];
        const lastDateKey = dateKeys[dateKeys.length - 1];
        
        const relevantLogEntries = appState.logEntries.filter(entry => 
            entry.date >= firstDateKey && entry.date <= lastDateKey
        );
        
        relevantLogEntries.forEach(entry => {
            const group = entry.group;
            const dateKey = entry.date;
            
            if (groupMaxSeverity.has(group)) { // We know the date is valid
                const currentMax = groupMaxSeverity.get(group).get(dateKey);
                const entrySeverity = hasSymptoms(entry) ? parseInt(entry.severity, 10) : 0;

                if (entrySeverity > currentMax) {
                    groupMaxSeverity.get(group).set(dateKey, entrySeverity);
                }
            }
        });

        // 8. Format data for Chart.js datasets (only showing groups with symptoms)
        const datasets = [];
        for (const group of FODMAP_GROUP_DATA) {
            if (group.value === "Restriction") continue;

            const severityMap = groupMaxSeverity.get(group.value);
            const data = Array.from(severityMap.values());
            const color = CHART_COLORS[group.value] || 'rgba(0, 0, 0, 1)';
            
            const hasSymptomData = data.some(s => s > 0);
            
            if (hasSymptomData) {
                datasets.push({
                    label: group.name.replace("Polyols - ", ""), // Shorten label
                    data: data,
                    borderColor: color,
                    backgroundColor: color.replace('1)', '0.1)'),
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: color
                });
            }
        }
        
        // 9. If no datasets were created (e.g., only "Restriction" entries), exit
        if (datasets.length === 0) {
            return;
        }

        // 10. Render new multi-line chart
        symptomChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: { size: 10 },
                            usePointStyle: true, // Use the point style (our solid color)
                            pointStyle: 'rect',  // Make the point style a rectangle
                            boxWidth: 15         // Adjust size of the rectangle
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.parsed.y} / 5`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        min: 0,
                        max: 5,
                        ticks: {
                            stepSize: 1
                        },
                        grid: {
                            display: false // Remove Y-axis grid
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 10 
                            }
                        },
                        grid: {
                            display: false // Remove X-axis grid
                        }
                    }
                }
            }
        });
    }

    // --- Global click listener to close popups ---
    window.addEventListener('click', () => {
        // Close custom select
        const fodmapOptions = document.getElementById('custom-fodmap-select-options');
        if (fodmapOptions.classList.contains('open')) { 
            fodmapOptions.classList.remove('open');
            document.getElementById('custom-fodmap-select-trigger').classList.remove('open');
        }
        
        // Close attachment popup
        const aiAttachPopup = document.getElementById('ai-attach-popup');
        if (aiAttachPopup.classList.contains('open')) {
            aiAttachPopup.classList.remove('open');
        }
    });

    /**
     * Packages and downloads the user's data as a JSON file.
     */
    function handleExportData() {
        showActionModal({
            title: 'Export Data Backup',
            message: "This will create a backup file containing all your logs and profile settings.\n\nThis file can be used with the 'Import' button to restore your data or move it to a new device. It will be saved to your device's default 'Downloads' folder.",
            confirmText: 'Export Now',
            onConfirm: async () => {
                try {
                    let backupData = {
                        logEntries: [],
                        userProfile: {}
                    };
                    
                    const user = auth.currentUser;
                    
                    if (user) {
                        // --- LOGGED IN: Fetch fresh data from cloud ---
                        const userDocRef = db.collection('users').doc(user.uid);
                        
                        // 1. Get logs
                        const logsSnapshot = await userDocRef.collection('logs').get();
                        const cloudLogs = logsSnapshot.docs.map(doc => doc.data());
                        
                        // 2. Get diet
                        const dietSnapshot = await userDocRef.collection('diet').get();
                        const cloudDiet = dietSnapshot.docs.map(doc => doc.data());
                        
                        // 3. Get profile (settings)
                        const profileDoc = await userDocRef.get();
                        const cloudProfile = profileDoc.data().userProfile || defaultProfile;

                        // 4. Assemble the backup object
                        backupData.logEntries = cloudLogs;
                        backupData.userProfile = { ...cloudProfile, personalizationFoods: cloudDiet };
                        
                    } else {
                        // --- GUEST: Use local state ---
                        backupData.logEntries = appState.logEntries;
                        backupData.userProfile = appState.userProfile;
                    }

                    // 5. Create and download the file
                    const dataStr = JSON.stringify(backupData, null, 2);
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;

                    const date = new Date().toISOString().split('T')[0];
                    a.download = `fodmap-logmap-backup-${date}.json`;

                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    URL.revokeObjectURL(url);
                    showToast("Data exported!", "success");

                } catch (err) {
                    console.error("Export failed:", err);
                    showToast("Data export failed.", "error");
                }
            }
        });
    }

    /**
     * Handles the file selection for importing data.
     * @param {Event} event - The change event from the file input.
     */
    function handleImportData(event) {
        const file = event.target.files[0];
        if (!file) {
            return; // User cancelled
        }

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // Basic validation
                if (!importedData.logEntries || !importedData.userProfile) {
                    throw new Error("Invalid file format.");
                }

                // --- NEW IMPORT LOGIC ---
                // 1. Set local storage and app state
                const logs = importedData.logEntries || [];
                // The 'diet' list is now in userProfile.personalizationFoods
                const profile = importedData.userProfile || defaultProfile;
                const dietFoods = profile.personalizationFoods || [];

                localStorage.setItem('fodmapLogEntries', JSON.stringify(logs));
                localStorage.setItem('fodmapUserProfile', JSON.stringify(profile));
                
                appState.logEntries = logs;
                appState.userProfile = profile;
                
                // 2. If user is logged in, batch-write to cloud
                const user = auth.currentUser;
                if (user) {
                    const batch = db.batch();
                    const userDocRef = db.collection('users').doc(user.uid);
                    
                    // 2a. Save the main userProfile (settings)
                    batch.set(userDocRef, { userProfile: profile });

                    // 2b. Add all logs to the /logs sub-collection
                    const logsColRef = userDocRef.collection('logs');
                    logs.forEach(log => {
                        const docRef = logsColRef.doc(String(log.id));
                        batch.set(docRef, log);
                    });
                    
                    // 2c. Add all diet foods to the /diet sub-collection
                    const dietColRef = userDocRef.collection('diet');
                    dietFoods.forEach(food => {
                        const docRef = dietColRef.doc(String(food.id));
                        batch.set(docRef, food);
                    });

                    // 2d. Commit the batch
                    await batch.commit();
                }
                
                // 3. Show confirmation and reload
                showToast("Import successful! Restarting app...", "success");
                setTimeout(() => {
                    location.reload();
                }, 2000);

            } catch (err) {
                console.error("Import failed:", err);
                showToast("Import failed. File may be invalid.", "error");
            }
        };
        
        reader.onerror = () => {
            console.error("File reading failed:", reader.error);
            showToast("Could not read the file.", "error");
        };

        reader.readAsText(file);

        // Reset the file input so the same file can be re-uploaded
        event.target.value = null;
    }

    /**
     * Shows a confirmation modal to reset all app data.
     */
    function handleResetApp() {
        showActionModal({
            title: 'Reset App Data',
            message: 'Are you sure? This will delete all log entries and profile settings. This action cannot be undone.',
            altText: 'Delete All', // Use altText for the red button
            onAltConfirm: () => { // Use onAltConfirm for the logic
                try {
                    localStorage.removeItem('fodmapLogEntries');
                    localStorage.removeItem('fodmapUserProfile');

                    showToast("App data cleared! Restarting...", "success");

                    setTimeout(() => {
                        location.reload();
                    }, 2000);

                } catch (err) {
                    console.error("Reset failed:", err);
                    showToast("Data reset failed.", "error");
                }
            }
        });
    }

    // --- Premium Success Logic ---
    const checkPremiumRedirect = () => {
        const urlParams = new URLSearchParams(window.location.search);
        
        // 1. Check for success flag from Stripe
        if (urlParams.get('status') === 'success') {
            const successModal = document.getElementById('premium-success-modal');
            const successCloseBtn = document.getElementById('premium-success-close');

            if (successModal) {
                // Show modal
                successModal.classList.remove('hidden');
                
                // Play a simple "ta-da" style toast as backup
                showToast("Welcome to Premium! 👑", "success");

                // Clean the URL (remove ?status=success) so it doesn't show on refresh
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({path: newUrl}, '', newUrl);

                // Setup Close Button
                if (successCloseBtn) {
                    successCloseBtn.addEventListener('click', () => {
                        successModal.classList.add('hidden');
                        // Optional: Navigate to AI tab to show off the unlocked feature
                        navigateTo('food-info');
                    });
                }
            }
        }
    };

    // Run the check
    checkPremiumRedirect();

    window.appState = appState; // <-- ADD THIS LINE FOR TESTING
});