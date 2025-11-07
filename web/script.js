// Scroll Animation Logic & Icon Init
document.addEventListener("DOMContentLoaded", () => {
    // Init Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } else {
        console.error('Lucide icons script did not load.');
    }

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