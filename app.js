document.addEventListener('DOMContentLoaded', () => {

    let deferredPrompt; // This will store the event for later use
    const installAppLi = document.getElementById('install-app-li');
    const installAppBtn = document.getElementById('install-app-btn');

     // --- CONSTANTS ---
     // These must be defined first to build the default profile
     const FODMAP_GROUP_DATA = [ { value: "Fructose", name: "Fructose", examples: "(e.g., Honey, Mango)" }, { value: "Lactose", name: "Lactose", examples: "(e.g., Milk, Yogurt)" }, { value: "Fructans (Grains)", name: "Fructans - Grains", examples: "(e.g., Wheat, Rye)" }, { value: "Fructans (Veg & Fruit)", name: "Fructans - Veg & Fruit", examples: "(e.g., Onion, Garlic)" }, { value: "GOS", name: "Galactans (GOS)", examples: "(e.g., Beans, Lentils)" }, { value: "Polyols (Sorbitol)", name: "Polyols - Sorbitol", examples: "(e.g., Avocado, Blackberry)" }, { value: "Polyols (Mannitol)", name: "Polyols - Mannitol", examples: "(e.g., Cauliflower, Mushroom)" }, { value: "Other", name: "Other / Unclassified", examples: "(Foods you're unsure how to classify)" }, { value: "Safe Meal", name: "Safe Meal", examples: "(A non-challenge or safe meal)" } ];
     const FODMAP_STYLES = { "Fructose": { color: "bg-yellow-100 text-yellow-800", icon: "🍎" }, "Lactose": { color: "bg-blue-100 text-blue-800", icon: "🥛" }, "Fructans (Grains)": { color: "bg-orange-100 text-orange-800", icon: "🍞" }, "Fructans (Veg & Fruit)": { color: "bg-purple-100 text-purple-800", icon: "🧅" }, "GOS": { color: "bg-teal-100 text-teal-800", icon: "🫘" }, "Polyols (Sorbitol)": { color: "bg-green-100 text-green-800", icon: "🥑" }, "Polyols (Mannitol)": { color: "bg-indigo-100 text-indigo-800", icon: "🍄" }, "Other": { color: "bg-gray-100 text-gray-800", icon: "❔" }, "Safe Meal": { color: "bg-slate-100 text-slate-800", icon: "🍴" } };
     const PROFILE_OPTIONS = { diagnoses: ["IMO", "SIBO", "IBS-D", "IBS-C", "IBS-M"], intolerances: ["Sorbitol", "Mannitol", "Lactose", "Fructose", "Gluten"], preferences: ["Vegetarian", "Vegan", "Pescatarian"] };
     const SYMPTOM_OPTIONS = ["Bloating", "Gas", "Abdominal pain", "Diarrhea", "Constipation", "Fatigue", "Headache"];

    const PHASE_STYLES = {
            "pre-treatment": { label: "Pre-Treatment", colorClass: "phase-pre-treatment" },
            "restriction": { label: "Restriction", colorClass: "phase-restriction" },
            "reintroduction": { label: "Reintroduction", colorClass: "phase-reintroduction" },
            "personalization": { label: "Personalization", colorClass: "phase-personalization" }
        };

    // --- DOM Elements (mostly constant) ---
    const pages = document.querySelectorAll('.page');
    const navItems = document.querySelectorAll('.nav-item');
    const addEntryFab = document.getElementById('add-entry-fab');
    const hamBtn = document.getElementById('hamburger-btn'); const sideMdl = document.getElementById('side-menu-modal'); const sideOvl = document.getElementById('side-menu-overlay'); const sideClose = document.getElementById('side-menu-close'); const openInfoBtn = document.getElementById('open-info-modal-btn'); const infoMdl = document.getElementById('info-modal'); const infoClose = document.getElementById('info-modal-close'); const infoCloseBtn = document.getElementById('info-modal-close-btn');
    // --- Phase-Controlled Elements ---
    const progressCard = document.getElementById('home-progress-card'); // You'll need to add this ID in index.html
    const insightsCard = document.getElementById('home-insights-card'); // You'll need to add this ID in index.html
    const pretreatmentCard = document.getElementById('home-pre-treatment-card');
    const restrictionCard = document.getElementById('home-restriction-card');
    const personalizationCard = document.getElementById('home-personalization-card');
    const planChallengeBtn = document.getElementById('plan-challenge-btn');
    const fodmapSelectContainer = document.getElementById('custom-fodmap-select-container');
    const fodmapHiddenInput = document.getElementById('log-fodmap-group');
    
    // --- Application State Object ---

    // Define the default profile structure
    const defaultProfile = { 
        diagnoses: [], 
        intolerances: [], 
        allergiesOther: '', 
        preferences: [], 
        apiKey: '',
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
        personalizationFoods: []
    };

    const savedProfile = localStorage.getItem('fodmapUserProfile') ? JSON.parse(localStorage.getItem('fodmapUserProfile')) : {};

    const appState = {
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
        currentLogView: 'date', // 'group' or 'date'
        currentDateSort: 'newest', // 'newest' or 'oldest'
        currentPersonalizationView: 'tolerance', // 'group' or 'tolerance'
        openLogFormOnLoad: false
    };

    // --- NEW: Deep merge/ensure personalizationFoods exists ---
    appState.userProfile.personalizationFoods = appState.userProfile.personalizationFoods || [];

    /**
     * Updates the UI contextually based on the user's current phase.
     * This function is called on startup and whenever the phase is changed.
     * @param {string} phase - The current phase (e.g., 'restriction')
     */
    function updateUiForPhase(phase) {
        console.log(`[Inference] Updating UI for phase: ${phase}`);

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

        // --- Call Home Page Renderers ---
        if (isPretreat) {
            renderCountdown('pre-treatment');
            renderPreTreatmentCard(); // Add this call
        }
        if (isRestrict) renderCountdown('restriction');
        if (isReintro) renderHomePage(); // This is the reintro progress list
        if (isPersonal) renderPersonalizationSummary();
        
        // --- 4. Update Nav Tab Label ---
        const reintroTab = document.querySelector('button[data-page="reintroduction-log"]');
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
        
        // --- NEW LOGIC for collapsible form ---
        const logFormWrapper = document.getElementById('add-log-entry-wrapper');
        if (pageId === 'reintroduction-log') {
            if (appState.openLogFormOnLoad) {
                logFormWrapper.classList.add('expanded'); // Expand it
                logFormWrapper.scrollIntoView({ behavior: 'smooth' }); // Scroll to it
                appState.openLogFormOnLoad = false; // Reset the flag
            } else {
                logFormWrapper.classList.remove('expanded'); // Ensure it's collapsed
            }
        }
        // --- END NEW LOGIC ---

        addEntryFab.classList.toggle('hidden', pageId === 'reintroduction-log');
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
        appState.openLogFormOnLoad = true; // Set the flag to auto-open
        navigateTo('reintroduction-log'); 
    });
    
    const toast = document.getElementById('toast');
    function showToast(message = "Saved!", status = 'success') { // 'success', 'error', 'warning'
        toast.textContent = message;
        
        // Get the calculated top padding of the body (which includes header + nav)
        const bodyPaddingTop = document.body.style.paddingTop || '100px';
        
        let colorClass = 'bg-accent'; // default to success (green)
        if (status === 'error') {
            colorClass = 'bg-error'; // red
        } else if (status === 'warning') {
            colorClass = 'bg-warning'; // orange
        }
        
        // New classes: top-left, new animation, AND pointer-events-none by default
        toast.className = `fixed left-4 py-2 px-4 rounded-lg shadow-xl opacity-0 transform -translate-y-10 transition-all duration-500 ease-in-out text-sm z-50 pointer-events-none ${colorClass}`;
        
        // Set the top position dynamically
        toast.style.top = `calc(${bodyPaddingTop} + 0.5rem)`; // 0.5rem (8px) margin from nav
        
        // Show toast: remove opacity/translate AND remove pointer-events-none
        toast.classList.remove('opacity-0', '-translate-y-10', 'pointer-events-none');
        
        // Hide toast: add back opacity/translate AND add back pointer-events-none
        setTimeout(() => {
            toast.classList.add('opacity-0', '-translate-y-10', 'pointer-events-none');
        }, 3000);
    }

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
        document.getElementById('log-form').querySelector('button[type="submit"]').textContent = 'Save Changes';
        document.getElementById('add-log-entry-wrapper').scrollIntoView({ behavior: 'smooth' });
    };

    const handleAIQuery = (prompt, title, imageData = null) => {
         aiResultsLoader.classList.remove('hidden'); aiResultsContainer.classList.add('hidden'); aiResultsContent.innerHTML = '';
         callGeminiAPI(prompt, imageData)
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
                }                    
                else { aiResultsContent.innerHTML = `<p class="text-error">Sorry, error.</p>`; aiResultsContainer.classList.remove('hidden'); }
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
            prompt = `FODMAP expert: Analyze ingredients in this image. ${buildProfileContext()}
            ${foodName ? `The user added this text: "${foodName}".` : ''}
            List all ingredients found. 
            For any high-FODMAP ingredient, explain why in one short sentence. Use *italics* or emojis for emphasis.
            Provide an **Overall Summary:** (Safe or Not Safe).
            Format *only* with **bold** headings, *italics*, newlines, and emojis. 
            Do NOT use tables, '###', '---', or '|'. Omit the disclaimer.`;
            
            handleAIQuery(prompt, title, appState.stagedImageData);

        } else if (foodName) {
            // We are searching with text only
            title = foodName;
            prompt = `FODMAP expert: Analyze '${foodName}'. ${buildProfileContext()}
            Provide a concise, 3-part answer. 
            Use this exact template:
            **FODMAP Level:** [Brief level & why. Use *italics* or emojis for emphasis, not full bold sentences.]
            **Safe Portion:** [Brief portion size. Use *italics* or emojis for emphasis.]
            **Substitutes:** [List 3-4 substitutes. Use *italics* or emojis for emphasis.]

            Do NOT use tables, '###', '---', or '|'. Omit the disclaimer.`;
            
            handleAIQuery(prompt, title, null);
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
        stagedImageContainer.classList.add('hidden');
        imagePreview.src = '';
    });

    const handleFileSelect = (event) => {
        const file = event.target.files[0]; if (!file) return; 
        const reader = new FileReader();
        reader.onload = (e) => {
            // 1. Get the base64 data
            appState.stagedImageData = e.target.result.split(',')[1]; 
            
            // 2. Show the preview
            imagePreview.src = e.target.result;
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
    const renderHomePage = () => {
        summaryContainer.innerHTML = '';
        let itemsAdded = 0; 

        FODMAP_GROUP_DATA.forEach(groupData => {
            if (groupData.value === "Restriction") return; // Skip this group
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
    };
    summaryContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.progress-item-header'); if (header) { const item = header.parentElement; const expanded = item.classList.contains('expanded'); summaryContainer.querySelectorAll('.progress-item').forEach(i => i.classList.remove('expanded')); if (!expanded) item.classList.add('expanded'); }
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
    function performScan(isMerging) {
        const newFoodsArray = [];
        const allFoodsByName = {}; // { milk: [...], apple: [...] }
        let foodIdCounter = Date.now();

        // 1. Group all log entries by food name (Same as before)
        appState.logEntries.forEach(entry => {
            if (!entry.group) return; // Only skip entries with no group

            const foodName = entry.food.trim().toLowerCase();
            if (!allFoodsByName[foodName]) {
                allFoodsByName[foodName] = [];
            }
            allFoodsByName[foodName].push(entry);
        });

        // 2. Process each unique food (Same as before)
        for (const foodName in allFoodsByName) {
            const entries = allFoodsByName[foodName];
            const mostRecentEntry = entries.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const group = mostRecentEntry.group; 

            const allTolerated = entries.every(e => !hasSymptoms(e));
            const triggerEntries = entries.filter(e => hasSymptoms(e));
            const severeTriggerEntries = triggerEntries.filter(e => parseInt(e.severity, 10) >= 4);

            let newFoodObject = {
                id: foodIdCounter++, // This ID is temporary if merging
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

        // --- 3. NEW: Handle Merging vs. Erasing ---
        let finalFoodCount = 0;

        if (isMerging) {
            // --- MERGE LOGIC ---
            let existingFoods = [...appState.userProfile.personalizationFoods];
            let newFoodsAdded = 0;
            let foodsUpdated = 0;

            newFoodsArray.forEach(scannedFood => {
                const existingIndex = existingFoods.findIndex(f => f.name.toLowerCase() === scannedFood.name.toLowerCase());

                if (existingIndex > -1) {
                    // Food exists: Update it
                    // Preserve the original ID
                    const originalId = existingFoods[existingIndex].id;
                    existingFoods[existingIndex] = { ...scannedFood, id: originalId }; // Overwrite with new data, keep ID
                    foodsUpdated++;
                } else {
                    // Food is new: Add it
                    existingFoods.push(scannedFood); // Will have its new temporary ID
                    newFoodsAdded++;
                }
            });

            appState.userProfile.personalizationFoods = existingFoods;
            finalFoodCount = existingFoods.length;
            showToast(`Scan complete! ${newFoodsAdded} foods added, ${foodsUpdated} updated.`, "success");

        } else {
            // --- ERASE LOGIC (Old behavior) ---
            appState.userProfile.personalizationFoods = newFoodsArray;
            finalFoodCount = newFoodsArray.length;
            showToast(`Scan complete! Found ${finalFoodCount} unique foods.`, "success");
        }

        // 4. Save & Re-render (Same as before)
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        renderPersonalizationSummary(); 
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

        // Populate options list (only if it's empty)
        if (fodmapOptions.children.length === 0) {
            FODMAP_GROUP_DATA.forEach(group => {
                const option = document.createElement('li');
                option.className = 'custom-select-option';
                option.dataset.value = group.value;
                
                // --- THIS IS THE FIX ---
                // The 'style' variable must be defined *before* it is used.
                // The duplicate/broken block has been removed.
                const style = FODMAP_STYLES[group.value] || { icon: '❓' };
                option.innerHTML = `
                    <div class="option-title">${style.icon} ${group.name}</div>
                    <div class="option-examples">${group.examples}</div>
                `;
                // --- END FIX ---

                fodmapOptions.appendChild(option);
            });
        }

        // Toggle dropdown
        fodmapTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
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
            const symptom = customSymptomInput.value.trim();
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
            const entryToEdit = appState.logEntries.find(entry => entry.id === entryId);
            if (entryToEdit) {
                appState.currentlyEditingId = entryId; // Set global edit state
                populateFormForEdit(entryToEdit);
                // Ensure form is expanded
                document.getElementById('add-log-entry-wrapper').classList.add('expanded');
            }
        } else if (deleteBtn) {
            // --- HANDLE DELETE ---
            const entryId = parseInt(deleteBtn.dataset.id);
            appState.logEntries = appState.logEntries.filter(entry => entry.id !== entryId);
            saveLogEntries(); // Re-render and save
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

    const saveLogEntries = () => { localStorage.setItem('fodmapLogEntries', JSON.stringify(appState.logEntries)); renderLogEntries(); renderHomePage(); };

    logForm.addEventListener('submit', (e) => {
        e.preventDefault(); 

        // --- NEW: Consistent Validation Block (Request 1 & 2) ---
        const currentPhase = appState.userProfile.currentPhase;
        const selectedGroup = document.getElementById('log-fodmap-group').value;
        const foodName = document.getElementById('log-food').value.trim();
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
            const index = appState.logEntries.findIndex(entry => entry.id === appState.currentlyEditingId);
            if (index !== -1) {
                appState.logEntries[index] = { ...entryData, id: appState.currentlyEditingId }; // Keep original ID
            }
            appState.currentlyEditingId = null; // Reset edit state
            showToast("Entry updated!", "success");
        } else {
            // --- ADD NEW ENTRY ---
            const newEntry = { ...entryData, id: Date.now() };
            appState.logEntries.push(newEntry); 
            showToast("Added!", "success");
        }

        saveLogEntries(); 
        logForm.reset(); 
        
        // --- Reset all form fields ---
        document.getElementById('log-date').valueAsDate = new Date(); 
        // Reset custom dropdown
        document.getElementById('custom-fodmap-select-text').textContent = 'Select FODMAP Group...';
        document.getElementById('custom-fodmap-select-trigger').classList.add('placeholder');
        document.getElementById('log-fodmap-group').value = '';

        document.getElementById('custom-symptom-tags-container').innerHTML = '';
        document.getElementById('custom-symptom-body').classList.add('hidden'); // Collapse the custom input
        document.querySelectorAll('input[name="symptoms"]').forEach(cb => cb.checked = false);
        document.getElementById('severity-section').classList.add('hidden'); 
        document.getElementById('log-form').querySelector('button[type="submit"]').textContent = 'Add Entry'; // Reset button text
        
        // Reset severity button group
        document.getElementById('log-severity-value').value = '1';
        document.querySelectorAll('#log-severity .severity-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.value === '1');
        });
    });
    
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
            
            // 2. Save to localStorage
            localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
            
            // 3. Update button UI
            sideMdl.querySelectorAll('#side-menu-phases .log-view-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            clickedButton.classList.add('active');
            
            // 4. Show toast
            const phaseName = newPhase.charAt(0).toUpperCase() + newPhase.slice(1);
            showToast(`Switched to ${phaseName} phase!`, "success");
            
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
        document.getElementById('profile-api-key').value = appState.userProfile.apiKey || '';

        // Smart-open the API key section if the key is missing
        if (!appState.userProfile.apiKey) {
            document.getElementById('api-key-accordion-container').classList.add('expanded');
        }
    };

    profileForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        // --- 1. Save Basic Profile Info (All Phases) ---
        appState.userProfile.diagnoses = Array.from(document.querySelectorAll('input[name=diagnoses]:checked')).map(el => el.value); 
        appState.userProfile.intolerances = Array.from(document.querySelectorAll('input[name=intolerances]:checked')).map(el => el.value); 
        appState.userProfile.preferences = Array.from(document.querySelectorAll('input[name=preferences]:checked')).map(el => el.value); 
        appState.userProfile.allergiesOther = document.getElementById('profile-allergies-other').value.trim();
        appState.userProfile.apiKey = document.getElementById('profile-api-key').value.trim();

        // --- 2. Phase-Specific Settings have been removed from this form ---
        // --- 3. Personalization Map logic REMOVED ---
        // (This will be handled by the new modal's save button later)

        // --- 4. Final Save to localStorage & Toast ---
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        showToast("Profile Saved!", "success");
    });

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
            const header = e.target.closest('.accordion-header');
            const foodLink = e.target.closest('.p13n-food-link');

            if (foodLink) {
                const foodId = parseInt(foodLink.dataset.foodId, 10);
                showFoodModal(foodId); // Open in VIEW mode
            } else if (header) {
                header.parentElement.classList.toggle('expanded');
            }
        });
    }

    // Add listener for personalization 'tolerance' accordion
    const p13nToleranceView = document.getElementById('personalization-tolerance-view');
    if (p13nToleranceView) {
        p13nToleranceView.addEventListener('click', (e) => {
            const header = e.target.closest('.accordion-header');
            const foodLink = e.target.closest('.p13n-food-link');
            
            if (foodLink) {
                const foodId = parseInt(foodLink.dataset.foodId, 10);
                showFoodModal(foodId); // Open in VIEW mode
            } else if (header) {
                header.parentElement.classList.toggle('expanded');
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
    
    hamBtn.addEventListener('click', openSide); 
    sideClose.addEventListener('click', closeSide); 
    sideOvl.addEventListener('click', closeSide); 
    openInfoBtn.addEventListener('click', () => { closeSide(); openInfo(); }); 
    infoClose.addEventListener('click', closeInfo); 
    infoCloseBtn.addEventListener('click', closeInfo);

    const geminiMdl = document.getElementById('gemini-modal'); const geminiTitle = document.getElementById('gemini-modal-title'); const geminiContent = document.getElementById('gemini-modal-content'); const geminiLoader = document.getElementById('gemini-modal-loader'); const geminiError = document.getElementById('gemini-modal-error'); const geminiClose = document.getElementById('gemini-modal-close');
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

    // --- NEW: Symptom Check Helper ---
    const hasSymptoms = (entry) => {
        const symptoms = entry.symptoms || ['None'];
        return !symptoms.includes('None') && symptoms.length > 0;
    };
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
        actionModalBtnConfirm.textContent = confirmText;
        actionModalBtnCancel.textContent = cancelText;

        // Get the new alt button
        const actionModalBtnAlt = document.getElementById('action-modal-btn-alt');

        // Configure for prompt
        if (type === 'prompt') {
            actionModalInputContainer.classList.remove('hidden');
            actionModalInput.value = ''; // Clear old value
            actionModalInput.focus();
        } else {
            actionModalInputContainer.classList.add('hidden');
        }

        // --- NEW: Configure Alt Button ---
        if (altText && onAltConfirm) {
            actionModalBtnAlt.textContent = altText;
            actionModalBtnAlt.classList.remove('hidden');
        } else {
            actionModalBtnAlt.classList.add('hidden');
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

        const handleCancel = () => {
            if (onCancel) {
                onCancel();
            }
            closeModal();
        };

        // --- NEW: Alt Confirm Handler ---
        const handleAltConfirm = () => {
            if (onAltConfirm) {
                onAltConfirm();
            }
            closeModal();
        };

        const closeModal = () => {
            actionModal.classList.add('hidden');
            // Remove the temporary listeners to avoid memory leaks
            actionModalBtnConfirm.removeEventListener('click', handleConfirm);
            actionModalBtnCancel.removeEventListener('click', handleCancel);
            actionModalClose.removeEventListener('click', handleCancel);
            actionModalBtnAlt.removeEventListener('click', handleAltConfirm); // NEW
        };
        
        // Attach the new, one-time listeners
        actionModalBtnConfirm.addEventListener('click', handleConfirm);
        actionModalBtnCancel.addEventListener('click', handleCancel);
        actionModalClose.addEventListener('click', handleCancel);
        actionModalBtnAlt.addEventListener('click', handleAltConfirm); // NEW
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

        // Save to localStorage
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));

        // Re-render home page components
        renderCountdown('pre-treatment');
        renderPreTreatmentCard();

        // Close modal and show toast
        closePreTreatmentModal();
        showToast("Pre-treatment settings saved!", "success");
    }

    // --- NEW: Pre-Treatment Modal Listeners ---
    if (ptModal) {
        document.getElementById('pretreatment-settings-btn').addEventListener('click', showPreTreatmentModal);
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

        // Save to localStorage
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));

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
                // Find the index of the food to delete
                const indexToDelete = appState.userProfile.personalizationFoods.findIndex(
                    food => food.id === currentEditingFoodId
                );
                
                if (indexToDelete > -1) {
                    appState.userProfile.personalizationFoods.splice(indexToDelete, 1); // Remove from array
                    localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile)); // Save
                    renderPersonalizationSummary(); // Re-render the Home page
                    closeFoodModal();
                    showToast("Food deleted.", "success");
                }
            }
        });
    });

    // --- NEW: Modal Main Action - SAVE ---
    foodModalEdit.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop the form from reloading the page

        // 1. Get all the data from the form
        const newFoodData = {
            id: currentEditingFoodId || Date.now(), // Use existing ID or create new one
            name: foodModalName.value,
            group: foodModalGroup.value || null,
            status: foodModalStatus.value,
            doseLogic: foodModalDoseLogic.value || null, // Save null if empty
            dose: foodModalDose.value,
            notes: foodModalNotes.value
        };

        // 2. Validate required fields
        if (!newFoodData.name || !newFoodData.status) {
            showToast("Please fill in all required fields (*).", "warning");
            return;
        }

        if (currentEditingFoodId) {
            // --- UPDATE EXISTING FOOD ---
            const indexToUpdate = appState.userProfile.personalizationFoods.findIndex(
                food => food.id === currentEditingFoodId
            );
            if (indexToUpdate > -1) {
                appState.userProfile.personalizationFoods[indexToUpdate] = newFoodData;
            }
        } else {
            // --- ADD NEW FOOD ---
            appState.userProfile.personalizationFoods.push(newFoodData);
        }

        // 3. Save to localStorage
        localStorage.setItem('fodmapUserProfile', JSON.stringify(appState.userProfile));
        
        // 4. Close modal, re-render Home, and show toast
        closeFoodModal();
        renderPersonalizationSummary();
        showToast("Food saved!", "success");
    });

    const openGemini = (title) => { geminiTitle.textContent = title; geminiMdl.classList.remove('hidden'); geminiLoader.classList.remove('hidden'); geminiContent.classList.add('hidden'); geminiError.classList.add('hidden'); }; const closeGemini = () => geminiMdl.classList.add('hidden'); geminiClose.addEventListener('click', closeGemini);
    const callGeminiAPI = async (prompt, imgData = null, retries = 3, delay = 1000) => {
        const key = appState.userProfile.apiKey || ""; 
        if (!key) {
            console.error("API Key is missing. Please add it in the Profile tab.");
            showToast("API Key is missing. Add it in your Profile.", "error");
            return null; // Stop the API call
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`; let parts = [{ text: prompt }]; if (imgData) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imgData } }); const payload = { contents: [{ parts }] };
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) { if (res.status === 429 && retries > 0) { await new Promise(r => setTimeout(r, delay)); return callGeminiAPI(prompt, imgData, retries - 1, delay * 2); } throw new Error(`${res.statusText} (${res.status})`); }
            const result = await res.json(); return result.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (err) { console.error("API failed:", err); return null; }
    };
    document.getElementById('summarize-journey-btn').addEventListener('click', async () => {
        if (appState.logEntries.length === 0) { showToast("Need logs.", "warning"); return; } 
        openGemini('✨ Summary'); 
        const logTxt = appState.logEntries.map(e => `Date:${e.date},Grp:${e.group},Food:${e.food},Dose:${e.dose},Sym:${e.symptom==='Other'?e.otherSymptom:e.symptom},Sev:${e.severity}/5`).join('; '); 
        
        // 1. UPDATED PROMPT:
        const prompt = `FODMAP helper (no medical advice). Analyze log based on profile: ${buildProfileContext()}. Log: ${logTxt}

        Provide a gentle, 3-part summary based *only* on the log entries and user profile.
        Format *only* with **bold** headings, *italics* for emphasis, and newlines. Use bullet points (like - or *) for lists.
        Do NOT use '###', '|', or tables. Omit the disclaimer.

        Use this exact template:
        **Overall Observation:** [A 1-2 sentence gentle observation about any potential patterns.]
        **Potential Triggers:** [A bulleted list of foods/groups from the log that *consistently* show symptoms with a severity of 3-5. If none, say "No clear triggers noted yet."]
        **Seemingly Well-Tolerated:** [A bulleted list of foods/groups from the log that *consistently* show "None" or low severity (1-2). If none, say "Keep logging to find your safe foods."]`

                        const summary = await callGeminiAPI(prompt); 
                        geminiLoader.classList.add('hidden'); 
                        if (summary === null && !appState.userProfile.apiKey) { geminiMdl.classList.add('hidden'); return; } 
                        
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
        const prompt = `FODMAP helper (no medical advice). User profile: ${buildProfileContext()}.
Create a 3-day reintroduction challenge plan for '${val}'.
Give a couple of specific foods and an increasing portion for each day.
Briefly explain *why* these foods are good choices (e.g., "contains only this FODMAP").
Include a "Washout Day" instruction after Day 3.
Format *only* with **bold** headings, *italics* for emphasis, and newlines. Use bullet points (- or *).
Do NOT use '###', '|', or tables. Omit the disclaimer.

Use this exact template:
**Foods:** [Food Names]
*Why these foods?:* [Brief explanation]

**Challenge Plan:**
- **Day 1:** [Portion]
- **Day 2:** [Larger Portion]
- **Day 3:** [Largest Portion]

**After Day 3:** Wait 2-3 "washout" days and log any delayed symptoms before starting your next challenge.`;

        const plan = await callGeminiAPI(prompt); 
        geminiLoader.classList.add('hidden'); 
        if (plan === null && !appState.userProfile.apiKey) { geminiMdl.classList.add('hidden'); return; } 
        
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

    // Dynamically set nav top and body padding
    const calculatePadding = () => { 
        const h = document.querySelector('header');
        const pb = document.getElementById('phase-bar'); // Get new phase bar
        const n = document.getElementById('main-nav'); 
        
        if (h && pb && n) { 
            const headerHeight = h.offsetHeight;
            const navHeight = n.offsetHeight;

            // --- NEW LOGIC ---
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
    };
    navigateTo('home');
    setupLogForm();
    // renderLogEntries(); // <-- REMOVED
    // renderHomePage(); // <-- REMOVED
    setupProfilePage();
    updateUiForPhase(appState.userProfile.currentPhase); // This now handles all initial rendering
    document.getElementById('log-date').valueAsDate = new Date();
    calculatePadding();
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

    // --- Click listener for Add Log Entry accordion ---
    document.getElementById('log-form-header').addEventListener('click', () => {
        document.getElementById('add-log-entry-wrapper').classList.toggle('expanded');
    });

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

    window.appState = appState; // <-- ADD THIS LINE FOR TESTING
});