// Project planner: ballpark cost estimator + timeline visualizer. Renders into #estimator and #timeline.
(function () {
    // Remodel rates per sq ft: Standard $70-150, Mid-Range $150-250, Premium $500-800 (shared by every remodel type)
    var REMODEL = [[70, 150], [150, 250], [500, 800]];

    // [low, high] dollars per unit for Standard / Mid-Range / Premium finishes - Kitsap County ballparks
    var COST = {
        bath:     { label: 'Bathroom Remodel', unit: 'sq ft of bathroom', size: 50, min: 20, max: 200, tiers: REMODEL },
        kitchen:  { label: 'Kitchen Remodel', unit: 'sq ft of kitchen', size: 150, min: 60, max: 500, tiers: REMODEL },
        addition: { label: 'Home Addition / ADU', unit: 'sq ft of new space', size: 400, min: 100, max: 1500, tiers: [[250, 325], [325, 425], [425, 600]] },
        deck:     { label: 'Deck', unit: 'sq ft of deck', size: 300, min: 50, max: 1500, tiers: [[45, 60], [60, 85], [85, 120]] },
        fence:    { label: 'Fence', unit: 'linear ft of fence', size: 150, min: 20, max: 1500, tiers: [[35, 50], [50, 70], [70, 100]] },
        roof:     { label: 'Roof Replacement', unit: 'sq ft of roof', size: 2000, min: 500, max: 6000, tiers: [[6, 9], [9, 12], [14, 20]] },
        siding:   { label: 'Siding', unit: 'sq ft of wall', size: 1800, min: 300, max: 6000, tiers: [[8, 12], [12, 18], [18, 28]] },
        flooring: { label: 'Flooring', unit: 'sq ft of floor', size: 500, min: 50, max: 4000, tiers: [[6, 9], [9, 14], [14, 24]] },
        paint:    { label: 'Interior Paint', unit: 'sq ft of floor area', size: 1200, min: 100, max: 5000, tiers: [[3, 5], [5, 7], [7, 10]] },
        windows:  { label: 'Window Replacement', unit: 'windows', size: 8, min: 1, max: 40, tiers: [[700, 1000], [1000, 1500], [1500, 2500]] }
    };
    var TIERS = ['Standard', 'Mid-Range', 'Premium'];

    // Phases in working days [min, max]; addition phases are in weeks
    var TIMELINE = {
        bath: { label: 'Bathroom Remodel', unit: 'days', phases: [['Demo & haul-off', 1, 2], ['Framing & prep', 2, 3], ['Waterproofing & tile', 5, 8], ['Vanity, glass & trim', 3, 4], ['Paint, punch & walkthrough', 1, 2]] },
        kitchen: { label: 'Kitchen Remodel', unit: 'days', phases: [['Demo & haul-off', 2, 4], ['Framing, drywall & texture', 5, 7], ['Cabinet installation', 3, 5], ['Countertop template & install', 7, 10], ['Backsplash & flooring', 4, 6], ['Paint, trim & punch list', 3, 5]] },
        deck: { label: 'Deck Build', unit: 'days', phases: [['Layout & footings', 2, 3], ['Framing', 3, 5], ['Decking', 2, 3], ['Railings & stairs', 2, 3], ['Cleanup & walkthrough', 1, 1]] },
        fence: { label: 'Fence Install', unit: 'days', phases: [['Layout & locates', 1, 1], ['Set posts', 1, 2], ['Rails & boards', 2, 3], ['Gates & hardware', 1, 1]] },
        roof: { label: 'Roof Replacement', unit: 'days', phases: [['Material delivery & protection', 1, 1], ['Tear-off', 1, 2], ['Deck repair & underlayment', 1, 2], ['Roofing install', 2, 4], ['Flashing, vents & cleanup', 1, 1]] },
        addition: { label: 'Addition / ADU', unit: 'weeks', phases: [['Design & engineering', 3, 6], ['Permitting', 4, 8], ['Foundation', 2, 3], ['Framing & dry-in', 3, 5], ['Rough inspections & insulation', 1, 2], ['Drywall, finishes & trim', 3, 5], ['Final inspection & punch', 1, 1]] }
    };

    function money(n) { return '$' + (Math.round(n / 500) * 500).toLocaleString('en-US'); }
    function opts(map) { return Object.keys(map).map(function (k) { return '<option value="' + k + '">' + map[k].label + '</option>'; }).join(''); }
    function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

    var est = document.getElementById('estimator');
    if (est) {
        est.appendChild(el('<div class="pl-card">' +
            '<div class="pl-row"><label class="pl-field"><span>Project</span><select id="plType">' + opts(COST) + '</select></label>' +
            '<label class="pl-field"><span id="plUnit">Size</span><input id="plSize" type="number" inputmode="numeric"></label></div>' +
            '<input id="plRange" type="range" aria-label="Project size">' +
            '<div class="pl-field"><span>Finish Level</span><div class="pl-tiers" role="radiogroup">' +
            TIERS.map(function (t, i) { return '<button type="button" role="radio" data-t="' + i + '"' + (i === 1 ? ' class="on" aria-checked="true"' : ' aria-checked="false"') + '>' + t + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="pl-out"><span>Ballpark Range</span><strong id="plOut">\u2014</strong><small id="plPer"></small></div>' +
            '<p class="pl-note">Ballpark only, based on typical Kitsap County projects. Actual pricing depends on site conditions, materials, structural work and permits. Every Bell &amp; Hammer estimate is free and written.</p>' +
            '<a href="#contact" class="btn btn-rust pl-cta">Get My Exact Quote</a></div>'));
        var type = est.querySelector('#plType'), size = est.querySelector('#plSize'), range = est.querySelector('#plRange'),
            unit = est.querySelector('#plUnit'), out = est.querySelector('#plOut'), per = est.querySelector('#plPer'), tier = 1;
        var calc = function () {
            var c = COST[type.value], n = Math.max(0, +size.value || 0), r = c.tiers[tier];
            out.textContent = n ? money(n * r[0]) + ' \u2013 ' + money(n * r[1]) : '\u2014';
            per.textContent = TIERS[tier] + ' \u00b7 ' + '$' + r[0].toLocaleString() + '\u2013$' + r[1].toLocaleString() + ' per ' + c.unit.replace(/^sq ft of .*/, 'sq ft').replace(/^linear ft.*/, 'linear ft').replace(/^windows$/, 'window');
        };
        var setType = function () {
            var c = COST[type.value];
            unit.textContent = 'Size (' + c.unit + ')';
            range.min = c.min; range.max = c.max; range.step = c.max > 100 ? 10 : 1;
            size.value = range.value = c.size;
            calc();
        };
        type.addEventListener('change', setType);
        range.addEventListener('input', function () { size.value = range.value; calc(); });
        size.addEventListener('input', function () { range.value = size.value; calc(); });
        est.querySelectorAll('.pl-tiers button').forEach(function (b, _, all) {
            b.addEventListener('click', function () {
                tier = +b.dataset.t;
                all.forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
                calc();
            });
        });
        setType();
    }

    var tl = document.getElementById('timeline');
    if (tl) {
        tl.appendChild(el('<div class="pl-card"><label class="pl-field"><span>Project</span><select id="tlType">' + opts(TIMELINE) + '</select></label>' +
            '<div class="tl-total"><span>Typical Duration</span><strong id="tlTotal"></strong></div><div class="tl-chart" id="tlChart"></div>' +
            '<p class="pl-note">Durations are typical working time once work starts. Permit review, custom-order materials and weather can extend the schedule \u2014 your written estimate includes a project-specific timeline.</p></div>'));
        var tt = tl.querySelector('#tlType'), chart = tl.querySelector('#tlChart'), total = tl.querySelector('#tlTotal');
        var draw = function () {
            var p = TIMELINE[tt.value], lo = 0, hi = 0, start = 0;
            p.phases.forEach(function (ph) { lo += ph[1]; hi += ph[2]; });
            var span = p.phases.reduce(function (s, ph) { return s + (ph[1] + ph[2]) / 2; }, 0);
            var fmt = function (a, b) {
                if (p.unit === 'weeks') return a === b ? a + ' wk' : a + '\u2013' + b + ' wks';
                return a === b ? a + (a === 1 ? ' day' : ' days') : a + '\u2013' + b + ' days';
            };
            total.textContent = p.unit === 'weeks' ? Math.round(lo / 4.3) + '\u2013' + Math.round(hi / 4.3) + ' months' :
                (hi >= 10 ? Math.max(1, Math.round(lo / 5)) + '\u2013' + Math.round(hi / 5) + ' weeks' : fmt(lo, hi));
            chart.innerHTML = p.phases.map(function (ph, i) {
                var mid = (ph[1] + ph[2]) / 2, left = start / span * 100, w = mid / span * 100;
                start += mid;
                return '<div class="tl-row" style="--d:' + (i * 70) + 'ms"><div class="tl-name">' + ph[0] + '<em>' + fmt(ph[1], ph[2]) + '</em></div>' +
                    '<div class="tl-track"><div class="tl-bar" style="left:' + left + '%;width:' + w + '%"></div></div></div>';
            }).join('');
        };
        tt.addEventListener('change', draw);
        draw();
    }
})();
