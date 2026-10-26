// Shared enhancements loaded on every page: floating Get Estimate button + mobile services dropdown.
(function () {
    var root = new URL('..', document.currentScript.src).href;

    function init() {
        // Floating CTA - skipped on pages that already have their own sticky bar
        if (!document.querySelector('.sticky-cta') && !document.body.hasAttribute('data-no-fab')) {
            var target = document.querySelector('#contact, #quote, #reserve, #rfp');
            var href = target ? '#' + target.id : root + 'bellnhammer.html#contact';
            var fab = document.createElement('div');
            fab.className = 'bh-fab';
            fab.innerHTML = '<a class="bh-fab-call" href="tel:3607100409" aria-label="Call Bell &amp; Hammer">&#9742;</a>' +
                '<a class="bh-fab-cta" href="' + href + '">Get Estimate</a>';
            document.body.appendChild(fab);
            var update = function () {
                var show = window.scrollY > 500;
                if (target) {
                    var r = target.getBoundingClientRect();
                    if (r.top < window.innerHeight && r.bottom > 0) show = false;
                }
                fab.classList.toggle('visible', show);
            };
            window.addEventListener('scroll', update, { passive: true });
            update();
        }
    }

    // Capture phase so this runs before each page's own "close menu on link click" handler
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('.dd-toggle');
        if (!t || !window.matchMedia('(max-width: 1280px)').matches) return;
        e.preventDefault();
        e.stopPropagation();
        t.parentNode.classList.toggle('dd-open');
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
