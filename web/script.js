// Scroll Animation Logic & Icon Init
document.addEventListener("DOMContentLoaded", () => {
    // Init Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } else {
        console.error('Lucide icons script did not load.');
    }

    // --- NEW: Mobile Menu Toggle Logic ---
    const menuBtn = document.getElementById('mobile-menu-btn');
    const menuDropdown = document.getElementById('mobile-menu-dropdown');
    const menuLinks = menuDropdown.querySelectorAll('a');

    // Helper function to close the menu
    const closeMenu = () => {
        menuDropdown.classList.add('hidden');
    };

    if (menuBtn && menuDropdown) {
        // Toggle menu when hamburger is clicked
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop this click from triggering the document listener
            menuDropdown.classList.toggle('hidden');
        });

        // FIX 1: Close menu when a link inside it is clicked
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });

        // FIX 2: Close menu when clicking outside
        document.addEventListener('click', (e) => {
            // If the menu is open, and the click was NOT on the menu AND NOT on the button, close it.
            if (
                !menuDropdown.classList.contains('hidden') &&
                !menuDropdown.contains(e.target) &&
                !menuBtn.contains(e.target)
            ) {
                closeMenu();
            }
        });
    }
    // --- END: Mobile Menu Toggle Logic ---


    const animatedElements = document.querySelectorAll("[data-animate]");

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1 // Trigger when 10% of the element is visible
        });

        animatedElements.forEach(el => {
            observer.observe(el);
            
            // Add animation class based on data attribute
            // Note: We're defining these classes in style.css
            const animationType = el.dataset.animateType || "slide-up"; // Default to slide-up
            if (animationType === "fade-in") {
                el.classList.add("animate-fade-in");
            } else {
                el.classList.add("animate-slide-up");
            }
        });
    } else {
        // Fallback for older browsers
        animatedElements.forEach(el => {
            el.classList.add("is-visible");
        });
    }
});