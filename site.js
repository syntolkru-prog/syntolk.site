/* The seven original sectors share one timeline for questions, gestures and motion. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rail = $('.topics');
  const tabs = $$('[data-topic]');
  const sectorCount = tabs.length;
  const panel = $('#question-panel');
  const question = $('#hero-question');
  const secondary = $('#second-question');
  const questionText = $('.question-text');
  const track = document.createElement('div');
  track.className = 'topics-track';
  track.setAttribute('role', 'presentation');

  function copySectors() {
    return tabs.map(tab => {
      const copy = tab.cloneNode(true);
      copy.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('aria-selected', 'false');
      copy.tabIndex = -1;
      return copy;
    });
  }
  // Two copies on either side let the same seven labels wrap without a blank edge.
  const visualTabs = [
    ...copySectors(), ...copySectors(), ...tabs, ...copySectors(), ...copySectors()
  ];
  track.append(...visualTabs);
  rail.replaceChildren(track);
  rail.tabIndex = 0;
  tabs.forEach(tab => { tab.tabIndex = -1; });

  const QUESTION_INTERVAL = 3500;
  const TRANSITION_DURATION = 600;
  const smoothstep = value => value * value * (3 - 2 * value);
  let centers = [], relativeCenters = [], period = 0, origin = 0, world = 0, railWidth = 0;
  let selected = 0, variant = 0, mode = 'idle', timer = 0, frame = 0;
  let heroVisible = true, pointer = null, suppressClickUntil = 0;
  let litTab = null, measuredWidth = 0, opacity = 1, nextBeat = 0;
  const modulo = (value, size) => ((value % size) + size) % size;
  const logicalIndex = virtual => modulo(virtual, sectorCount);
  const canRun = () => !document.hidden && heroVisible && !$('#case-dialog').open;

  function targetFor(virtual) {
    const turn = Math.floor(virtual / sectorCount);
    return origin + turn * period + relativeCenters[logicalIndex(virtual)];
  }
  function nearestVirtual(position) {
    const turn = Math.floor((position - origin) / period);
    let best = selected, distance = Infinity;
    for (let copy = turn - 1; copy <= turn + 1; copy++) {
      for (let index = 0; index < sectorCount; index++) {
        const virtual = copy * sectorCount + index;
        const gap = Math.abs(targetFor(virtual) - position);
        if (gap < distance) { distance = gap; best = virtual; }
      }
    }
    return best;
  }
  function draw() {
    if (!period) return;
    const local = origin + modulo(world - origin, period);
    track.style.transform = `translate3d(${-local}px,0,0)`;
    const center = local + railWidth / 2;
    let nearest = visualTabs[0], distance = Infinity;
    visualTabs.forEach((tab, index) => {
      // The visual highlight belongs to the center, including during a drag/fling.
      const gap = Math.abs(centers[index] - center);
      if (gap < distance) { distance = gap; nearest = tab; }
    });
    if (nearest !== litTab) {
      litTab?.classList.remove('is-active');
      nearest.classList.add('is-active');
      litTab = nearest;
    }
  }
  function stopTimer(resetBeat = true) {
    clearTimeout(timer);
    timer = 0;
    if (resetBeat) nextBeat = 0;
  }
  function stopMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function reserveQuestionSpace() {
    const width = questionText.clientWidth;
    if (!width) return;
    measuredWidth = width;
    const probe = document.createElement('p');
    const style = getComputedStyle(question);
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;min-height:0;height:auto;left:0;top:0;';
    probe.style.width = width + 'px';
    for (const property of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textWrap','wordBreak','overflowWrap']) probe.style[property] = style[property];
    questionText.append(probe);
    let tallest = 0;
    for (const scenario of scenarios) {
      for (const sample of scenario.questions) {
        probe.textContent = sample;
        tallest = Math.max(tallest, probe.getBoundingClientRect().height);
      }
    }
    probe.remove();
    questionText.style.setProperty('--question-height', Math.ceil(tallest) + 'px');
  }
  function hideQuestionForMotion() {
    setQuestionOpacity(0);
  }
  function setQuestionOpacity(value) {
    opacity = value;
    questionText.style.opacity = String(value);
  }
  function paintQuestion() {
    const entry = scenarios[logicalIndex(selected)];
    tabs.forEach((tab, index) => tab.setAttribute('aria-selected', String(index === logicalIndex(selected))));
    rail.setAttribute('aria-activedescendant', tabs[logicalIndex(selected)].id);
    panel.setAttribute('aria-labelledby', tabs[logicalIndex(selected)].id);
    question.textContent = entry.questions[variant];
    secondary.hidden = true;
    $('#question-accessibility').textContent = entry.questions[variant];
  }
  function schedule() {
    stopTimer(false);
    if (mode !== 'idle' || !canRun()) return;
    const now = performance.now();
    // The midpoint of each transition is the beat: 3.5 s between text changes.
    // Transition time is included, never added to the interval.
    if (!nextBeat || nextBeat < now) {
      nextBeat = now + QUESTION_INTERVAL - (reduced.matches ? 0 : TRANSITION_DURATION / 2);
    }
    timer = setTimeout(() => {
      timer = 0;
      if (!canRun() || mode !== 'idle') return;
      const began = nextBeat;
      nextBeat += QUESTION_INTERVAL;
      transitionTo(variant === 0 ? selected : selected + 1, variant === 0 ? 1 : 0, began);
    }, Math.max(0, nextBeat - now));
  }
  function transitionTo(virtual, nextVariant, began = performance.now()) {
    stopMotion();
    mode = 'transition';
    const start = world, target = targetFor(virtual), startOpacity = opacity;
    const duration = reduced.matches ? 0 : TRANSITION_DURATION;
    let swapped = false;
    const tick = now => {
      if (!canRun()) { pauseCarousel(); return; }
      const progress = duration ? Math.max(0, Math.min(1, (now - began) / duration)) : 1;
      const eased = smoothstep(progress);
      world = start + (target - start) * eased;
      if (progress >= .5 && !swapped) {
        setQuestionOpacity(0);
        selected = virtual;
        variant = nextVariant;
        paintQuestion();
        swapped = true;
      }
      setQuestionOpacity(progress < .5 ? startOpacity * (1 - smoothstep(progress * 2)) : smoothstep((progress - .5) * 2));
      draw();
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        frame = 0;
        mode = 'idle';
        schedule();
      }
    };
    tick(performance.now());
  }
  function choose(virtual) {
    stopTimer();
    const began = performance.now();
    nextBeat = began + QUESTION_INTERVAL;
    transitionTo(virtual, 0, began);
  }
  function settle() {
    choose(nearestVirtual(world));
  }
  function startInertia(speed) {
    stopTimer();
    stopMotion();
    if (reduced.matches || Math.abs(speed) < .08) { settle(); return; }
    const velocity = Math.max(-4.2, Math.min(4.2, speed));
    const strength = Math.abs(velocity);
    // Scale distance and time independently: a strong swipe travels farther,
    // while every release keeps enough time for a calm deceleration.
    const coastTime = 350 + 70 * Math.log1p(strength);
    const projected = world + velocity * coastTime;
    const virtual = nearestVirtual(projected);
    const start = world, target = targetFor(virtual), distance = target - start;
    const duration = Math.min(2600, 1050 + 800 * Math.log1p(strength));
    const releaseSlope = distance * velocity > 0
      ? Math.max(.8, Math.min(2.2, Math.abs(velocity * duration / distance)))
      : 1;
    const began = performance.now();
    mode = 'inertia';
    hideQuestionForMotion();
    const coast = now => {
      if (!canRun()) { pauseCarousel(); return; }
      const progress = Math.min(1, Math.max(0, (now - began) / duration));
      // Quintic Hermite curve: it continues the release momentum, then reaches
      // both zero speed and zero acceleration at the center. That soft tail is
      // what removes the visible last-moment stop.
      const progress2 = progress * progress;
      const progress3 = progress2 * progress;
      const progress4 = progress3 * progress;
      const progress5 = progress4 * progress;
      const eased = releaseSlope * progress
        + (10 - 6 * releaseSlope) * progress3
        + (8 * releaseSlope - 15) * progress4
        + (6 - 3 * releaseSlope) * progress5;
      world = start + distance * eased;
      draw();
      if (progress < 1) frame = requestAnimationFrame(coast);
      else {
        frame = 0;
        // Reuse the existing fade-in after the fling has stopped, with no second snap.
        nextBeat = now + QUESTION_INTERVAL - TRANSITION_DURATION / 2;
        transitionTo(virtual, 0, now - TRANSITION_DURATION / 2);
      }
    };
    coast(began);
  }
  function pauseCarousel() {
    stopTimer();
    stopMotion();
    pointer = null;
    rail.classList.remove('is-dragging');
    if (mode !== 'idle') {
      selected = nearestVirtual(world);
      variant = 0;
    }
    mode = 'idle';
    world = targetFor(selected);
    paintQuestion();
    setQuestionOpacity(1);
    draw();
  }
  function measure(force = false) {
    const width = rail.clientWidth;
    if (!width || (!force && width === railWidth)) return;
    if (period) pauseCarousel();
    railWidth = width;
    centers = visualTabs.map(tab => tab.offsetLeft + tab.offsetWidth / 2);
    period = centers[sectorCount * 3] - centers[sectorCount * 2];
    relativeCenters = tabs.map((_, index) => centers[sectorCount * 2 + index] - centers[sectorCount * 2]);
    origin = centers[sectorCount * 2] - railWidth / 2;
    world = targetFor(selected);
    draw();
    schedule();
  }

  rail.addEventListener('pointerdown', event => {
    if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const interruptedMotion = mode !== 'idle';
    stopTimer();
    stopMotion();
    if (interruptedMotion) hideQuestionForMotion();
    mode = 'pending';
    pointer = {id: event.pointerId, startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastTime: event.timeStamp, speed: 0, dragging: false,
      interruptedMotion};
  });
  rail.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (!pointer.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        const interruptedMotion = pointer.interruptedMotion;
        pointer = null;
        if (interruptedMotion) settle();
        else { mode = 'idle'; schedule(); }
        return;
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      pointer.dragging = true;
      mode = 'dragging';
      hideQuestionForMotion();
      rail.classList.add('is-dragging');
      rail.setPointerCapture(event.pointerId);
    }
    const delta = event.clientX - pointer.lastX;
    const dt = Math.max(8, event.timeStamp - pointer.lastTime);
    world -= delta;
    pointer.speed = pointer.speed * .55 + (-delta / dt) * .45;
    pointer.lastX = event.clientX;
    pointer.lastTime = event.timeStamp;
    draw();
    event.preventDefault();
  });
  rail.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const gesture = pointer;
    pointer = null;
    rail.classList.remove('is-dragging');
    if (gesture.dragging) {
      suppressClickUntil = performance.now() + 400;
      startInertia(event.timeStamp - gesture.lastTime > 100 ? 0 : gesture.speed);
    } else if (gesture.interruptedMotion) settle();
    else { mode = 'idle'; schedule(); }
  });
  rail.addEventListener('pointercancel', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const interruptedMotion = pointer.dragging || pointer.interruptedMotion;
    pointer = null;
    rail.classList.remove('is-dragging');
    if (interruptedMotion) settle();
    else { mode = 'idle'; schedule(); }
  });
  rail.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
    const tab = event.target.closest('[data-topic]');
    if (!tab || !rail.contains(tab)) return;
    const rect = tab.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const target = world + rect.left + rect.width / 2 - railRect.left - rail.clientWidth / 2;
    choose(nearestVirtual(target));
    rail.focus({preventScroll: true});
  });
  rail.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = selected + 1;
    if (event.key === 'ArrowLeft') target = selected - 1;
    if (event.key === 'Home') target = Math.floor(selected / sectorCount) * sectorCount;
    if (event.key === 'End') target = Math.floor(selected / sectorCount) * sectorCount + sectorCount - 1;
    if (event.key === 'Enter' || event.key === ' ') target = selected;
    if (target === undefined) return;
    event.preventDefault();
    choose(target);
    rail.focus({preventScroll: true});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseCarousel();
    else schedule();
  });
  reduced.addEventListener('change', () => {
    pauseCarousel();
    schedule();
    reserveQuestionSpace();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) schedule();
      else pauseCarousel();
    }, {threshold: 0}).observe($('.hero'));
  }
  measure();
  paintQuestion();
  reserveQuestionSpace();
  document.fonts.ready.then(() => { measure(true); reserveQuestionSpace(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => {
    measure();
    if (questionText.clientWidth !== measuredWidth) reserveQuestionSpace();
  }).observe(rail);
  window.addEventListener('resize', () => { measure(); reserveQuestionSpace(); });

  // Original pricing interaction and responsive details from syntolk.ru.

(() => {
  const switcher = document.querySelector('.pricing-switch');
  if (!switcher) return;

  const indicator = switcher.querySelector('.pricing-switch-indicator');
  const buttons = [...switcher.querySelectorAll('[data-pricing-target]')];
  const pricing = switcher.closest('.pricing');
  const panels = pricing ? [...pricing.querySelectorAll('[data-pricing-panel]')] : [];
  if (!indicator || !buttons.length || !panels.length) return;

  function moveIndicator(button, animate = true){
    if (!animate) indicator.style.transition = 'none';
    indicator.style.left = button.offsetLeft + 'px';
    indicator.style.width = button.offsetWidth + 'px';
    if (!animate) requestAnimationFrame(() => { indicator.style.transition = ''; });
  }

  function activate(target, animate = true){
    const nextButton = buttons.find(btn => btn.dataset.pricingTarget === target);
    const nextPanel = panels.find(panel => panel.dataset.pricingPanel === target);
    if (!nextButton || !nextPanel) return;

    buttons.forEach(btn => {
      const active = btn === nextButton;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });

    panels.forEach(panel => {
      const active = panel === nextPanel;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });

    moveIndicator(nextButton, animate);
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.pricingTarget, true));
  });

  window.addEventListener('resize', () => {
    const activeButton = buttons.find(btn => btn.classList.contains('active'));
    if (activeButton) moveIndicator(activeButton, false);
  });

  switcher.addEventListener('keydown',event=>{
    const index=buttons.indexOf(document.activeElement);
    if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    activate(buttons[next].dataset.pricingTarget);buttons[next].focus();
  });
  const initialButton = buttons.find(btn => btn.classList.contains('active')) || buttons[0];
  activate(initialButton.dataset.pricingTarget, false);

  function selectPlan(plan){
    const panel = plan.closest('[data-pricing-panel]');
    if (!panel) return;
    const plans = [...panel.querySelectorAll('.plan')];
    plans.forEach(item => {
      const selected = item === plan;
      item.classList.toggle('pop', selected);
      item.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  panels.forEach(panel => {
    const plans = [...panel.querySelectorAll('.plan')];
    plans.forEach(plan => {
      plan.setAttribute('role', 'button');
      plan.tabIndex = 0;
      plan.setAttribute('aria-pressed', plan.classList.contains('pop') ? 'true' : 'false');
      plan.addEventListener('click', event => {
        if(event.target.closest('summary,a'))return;
        if(window.matchMedia('(max-width:760px)').matches)return;
        selectPlan(plan);
      });
      plan.addEventListener('keydown', event => {
        if (event.target === plan && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          selectPlan(plan);
        }
      });
    });
  });
})();

(() => {
  const mobile = matchMedia('(max-width:760px)');
  const details = [...document.querySelectorAll('#pricing .plan-details')];
  const sync = () => {
    details.forEach(item => {item.open = !mobile.matches;});
    document.querySelectorAll('#pricing .plan').forEach(item => {
      if (mobile.matches) {item.removeAttribute('role');item.removeAttribute('tabindex');item.removeAttribute('aria-pressed');}
      else {item.setAttribute('role','button');item.tabIndex=0;item.setAttribute('aria-pressed',String(item.classList.contains('pop')));}
    });
  };
  mobile.addEventListener('change',sync);sync();
})();


  const menuButton = $('.menu-toggle');
  const mobileNav = $('#mobile-nav');
  function closeMenu(returnFocus = false) {
    mobileNav.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    const opening = mobileNav.hidden;
    mobileNav.hidden = !opening;
    menuButton.setAttribute('aria-expanded', String(opening));
    menuButton.setAttribute('aria-label', opening ? 'Закрыть меню' : 'Открыть меню');
  });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileNav.hidden) closeMenu(true); });
  matchMedia('(min-width:801px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

  // Mobile gallery: four complete cards, a blurred preview, and an explicit reveal.
  const casesSection = $('#cases');
  const galleryWindow = $('#gallery-window');
  const caseGrid = $('#case-grid');
  const caseCards = [...caseGrid.children];
  const galleryToggle = $('.gallery-toggle');
  const mobileGallery = matchMedia('(max-width:600px)');
  let galleryExpanded = false;
  function sizeGallery() {
    if (!mobileGallery.matches || galleryExpanded) return;
    const previewStart = caseCards[4].getBoundingClientRect().top-galleryWindow.getBoundingClientRect().top;
    galleryWindow.style.setProperty('--gallery-height', (previewStart+88)+'px');
  }
  function updateGallery(announce = false) {
    const mobile = mobileGallery.matches;
    const collapsed = mobile && !galleryExpanded;
    caseCards.forEach((card, index) => {
      const previewOnly = collapsed && index >= 4;
      card.inert = previewOnly;
      if (previewOnly) card.setAttribute('aria-hidden','true');
      else card.removeAttribute('aria-hidden');
      if (galleryExpanded) card.classList.add('is-visible');
    });
    galleryWindow.classList.toggle('is-collapsed', collapsed);
    galleryToggle.parentElement.hidden = !mobile;
    galleryToggle.setAttribute('aria-expanded',String(galleryExpanded));
    galleryToggle.innerHTML = galleryExpanded ? 'Свернуть <span aria-hidden="true">↑</span>' : 'Посмотреть все <span aria-hidden="true">↓</span>';
    sizeGallery();
    if (announce) $('#gallery-status').textContent = collapsed ? 'Показаны 4 из 8 отраслей' : 'Показаны все 8 отраслей';
  }
  galleryToggle.addEventListener('click',()=>{
    galleryExpanded=!galleryExpanded;
    updateGallery(true);
    if (!galleryExpanded) caseGrid.scrollIntoView({block:'start',behavior:reduced.matches?'instant':'smooth'});
  });
  mobileGallery.addEventListener('change',updateGallery);
  if ('ResizeObserver' in window) new ResizeObserver(sizeGallery).observe(caseGrid);
  document.fonts.ready.then(sizeGallery);
  casesSection.classList.add('gallery-enhanced');
  updateGallery();

  const dialog = $('#case-dialog');
  let trigger = null, oldOverflow = '';
  $$('[data-case]').forEach(button => button.addEventListener('click', () => {
    const entry = caseStudies[Number(button.dataset.case)];
    trigger = button;
    $('#dialog-image').hidden = !entry.image;
    if (entry.image) $('#dialog-image').src = entry.image;
    else $('#dialog-image').removeAttribute('src');
    $('#dialog-image').alt = '';
    $('#dialog-category').textContent = entry.name;
    $('#dialog-title').textContent = entry.headline;
    $('#dialog-intro').textContent = entry.intro;
    const makeList = texts => texts.map(text => { const li = document.createElement('li'); li.textContent = text; return li; });
    $('#dialog-questions').replaceChildren(...makeList(entry.questions));
    $('#dialog-questions').hidden = !entry.questions.length;
    $('#dialog-questions').previousElementSibling.hidden = !entry.questions.length;
    $('#dialog-benefits').replaceChildren(...makeList(entry.benefits));
    $('#dialog-files').textContent = entry.files;
    oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    pauseCarousel();
    dialog.showModal();
    dialog.scrollTop = 0;
    $('.dialog-close').focus({ preventScroll: true });
  }));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  // Only an actual click outside the dialog closes it; content clicks stay put.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = oldOverflow;
    trigger?.focus({ preventScroll: true });
    schedule();
  });

})();

// Compact accordions on phones; their contents stay visible on desktop.
(() => {
  const phone = matchMedia('(max-width: 760px)');
  const groups = [...document.querySelectorAll('.responsive-details')];
  const sync = () => groups.forEach(group => { group.open = !phone.matches; });
  groups.forEach(group => group.querySelector('summary').addEventListener('click', event => {
    if (!phone.matches) event.preventDefault();
  }));
  phone.addEventListener('change', sync);
  sync();
})();


(() => {
  const aboutRoot = document.getElementById('syntolk-about');
  if (!aboutRoot) return;

const SCREENS = ["<h1>Syntolk Assistant</h1>\n<h2>Интеллектуальный помощник, который работает не на догадках, а на доказательствах</h2>\n<p>Syntolk Assistant — это корпоративный AI-помощник для анализа документов, поиска информации, сопоставления данных и подготовки обоснованных ответов.</p>\n<p>Его ключевое отличие — не просто способность сформулировать красивый текст, а умение <strong>найти подтверждение, проверить контекст, учесть ограничения и показать, на чём основан каждый существенный вывод</strong>.</p>", "<h2>Экспертный подход в любой отрасли</h2>\n<p>Syntolk Assistant может работать с материалами практически любой сферы, если ему предоставить соответствующую информацию:</p>\n<ul><li>юриспруденция;</li><li>финансы и бухгалтерия;</li><li>закупки;</li><li>продажи;</li><li>производство;</li><li>строительство;</li><li>медицина;</li><li>фармацевтика;</li><li>IT;</li><li>образование;</li><li>HR;</li><li>логистика;</li><li>страхование;</li><li>маркетинг;</li><li>государственное управление;</li><li>техническая документация;</li><li>внутренние регламенты и корпоративные стандарты.</li></ul>\n<p>При этом его задача — не изображать универсального специалиста, который отвечает «из головы», а <strong>погружаться в конкретную предметную область через документы, инструкции, договоры, отчёты, нормативные материалы и другие предоставленные источники</strong>.</p>\n<p>Чем больше качественной информации о сфере загружено в систему, тем точнее Syntolk Assistant может:</p>\n<ul><li>использовать профессиональную терминологию;</li><li>учитывать специфику отрасли;</li><li>сопоставлять положения разных документов;</li><li>находить противоречия;</li><li>выделять обязательные условия и исключения;</li><li>готовить ответы в формате, необходимом именно для этой области.</li></ul>\n<h3>Важный принцип</h3>\n<p>Syntolk Assistant не подменяет документы собственными догадками. Если в материалах недостаточно информации, он не будет уверенно придумывать ответ, а укажет:</p>\n<ul><li>что удалось подтвердить;</li><li>чего именно не хватает;</li><li>какие документы необходимо проверить;</li><li>где источники расходятся между собой.</li></ul>", "<h1>Почему это больше, чем обычный AI</h1>\n<p>Обычная нейросеть может быстро сформулировать убедительный ответ. Однако убедительный текст не всегда означает точный, проверенный и применимый ответ.</p>\n<p>Syntolk Assistant использует другой подход:</p>\n<blockquote><strong><em>сначала доказательства — затем проверка — только потом вывод.</em></strong></blockquote>\n<h2>Сравнение подходов</h2>\n<div class=\"table-wrap\"><table><thead><tr><th><strong>Обычный AI-подход</strong></th><th><strong>Подход Syntolk Assistant</strong></th></tr></thead><tbody><tr><td>Может ответить на основе общих знаний</td><td>Работает на основе предоставленных материалов и найденных источников</td></tr><tr><td>Иногда заполняет пробелы предположениями</td><td>Отдельно указывает, если данных недостаточно</td></tr><tr><td>Может привести общий ответ без привязки к документу</td><td>Привязывает выводы к конкретным документам и фрагментам</td></tr><tr><td>Не всегда учитывает исключения и ограничения</td><td>Проверяет условия, исключения, даты, суммы и формулировки</td></tr><tr><td>Может смешать сведения из разных объектов</td><td>Разделяет документы, договоры, версии, стороны и периоды</td></tr><tr><td>Формирует ответ, который звучит убедительно</td><td>Формирует ответ, который можно проверить</td></tr><tr><td>Не всегда показывает происхождение информации</td><td>Добавляет ссылки и указатели на использованные источники, если они доступны</td></tr><tr><td>Может усилить смысл исходного текста</td><td>Сохраняет модальность: «может», «вправе», «рекомендуется», «не менее»</td></tr><tr><td>Может выбрать одну из противоречащих версий</td><td>Показывает обе версии и указывает источник каждой</td></tr><tr><td>Даёт один общий текст</td><td>Структурирует ответ по отдельным вопросам и смысловым блокам</td></tr></tbody></table></div>", "<h1>Работа с источниками</h1>\n<p>Одна из главных особенностей Syntolk Assistant — возможность показывать, <strong>откуда взята информация</strong>.</p>\n<p>В ответах могут использоваться:</p>\n<ul><li>ссылки на конкретные документы;</li><li>указатели на отдельные фрагменты;</li><li>названия файлов;</li><li>ссылки на подтверждающие части текста;</li><li>перечень использованных источников в конце ответа.</li></ul>\n<p>Это позволяет не просто прочитать результат, а самостоятельно проверить:</p>\n<ol><li>какой документ был использован;</li><li>какая часть документа подтверждает вывод;</li><li>относится ли положение к нужному договору, периоду или организации;</li><li>не были ли пропущены ограничения и исключения;</li><li>соответствует ли ответ исходной формулировке.</li></ol>\n<p>Такой формат особенно важен там, где ответ должен быть не только понятным, но и проверяемым: в договорах, закупках, финансовых расчётах, внутренних процедурах, нормативных документах и деловой переписке.</p>", "<h1>Сложный многоэтапный анализ</h1>\n<p>Syntolk Assistant не ограничивается поиском первого подходящего фрагмента.</p>\n<p>Для подготовки качественного ответа он может последовательно:</p>\n<ol><li>Разобрать запрос на отдельные задачи.</li><li>Определить нужный документ, объект, лицо, период или версию.</li><li>Найти релевантные материалы.</li><li>Проверить несколько источников.</li><li>Прочитать документ глубже, если найденный фрагмент вырван из контекста.</li><li>Сопоставить связанные положения.</li><li>Проверить даты, суммы, условия, исключения и ограничения.</li><li>Найти возможные противоречия.</li><li>Отделить подтверждённые факты от неподтверждённых предположений.</li><li>Сформировать структурированный ответ с указанием источников.</li></ol>\n<p>Иными словами, система использует не поверхностную генерацию текста, а <strong>многоступенчатую логическую обработку информации</strong>.</p>\n<p>При этом внутренний ход рассуждений не подменяет источники: в итог попадают только те выводы, которые можно подтвердить предоставленными материалами.</p>", "<h1>Точность без выдумок</h1>\n<p>Syntolk Assistant придерживается принципа:</p>\n<blockquote><strong><em>Если факт нельзя доказать — его нельзя выдавать как установленный.</em></strong></blockquote>\n<p>Поэтому система не должна:</p>\n<ul><li>придумывать отсутствующие условия;</li><li>выдавать предположение за факт;</li><li>приписывать документу то, чего в нём нет;</li><li>смешивать положения разных договоров;</li><li>самостоятельно выбирать более удобную версию при противоречии;</li><li>превращать частный пример в общее правило;</li><li>менять степень обязательности формулировки;</li><li>использовать отсутствие упоминания как доказательство отсутствия события.</li></ul>\n<p>Например, если документ содержит формулировку «может быть предусмотрено», нельзя автоматически заменить её на «обязательно предусмотрено».</p>\n<p>Если в документах не найдено подтверждение, корректный ответ будет выглядеть так:</p>\n<blockquote><em>«В предоставленных документах недостаточно информации, чтобы точно ответить на этот вопрос».</em></blockquote>\n<p>Это не ограничение, а важный элемент надёжности: пользователь видит не только найденную информацию, но и границы подтверждённого знания.</p>", "<h1>Работа с противоречиями</h1>\n<p>Если разные документы содержат разные сведения, Syntolk Assistant не скрывает расхождение и не выбирает одну версию без основания.</p>\n<p>Он может показать:</p>\n<ul><li>позицию первого документа;</li><li>позицию второго документа;</li><li>даты и версии;</li><li>относящиеся к ним условия;</li><li>источник каждой формулировки;</li><li>информацию, которой не хватает для окончательного разрешения противоречия.</li></ul>\n<p>Такой подход позволяет пользователю самостоятельно принять решение на основе полной картины, а не на основе случайно выбранного фрагмента.</p>", "<h1>Работа с большими массивами документов</h1>\n<p>Syntolk Assistant подходит для анализа не только одного файла, но и больших документальных массивов:</p>\n<ul><li>архивов договоров;</li><li>внутренних баз знаний;</li><li>нормативной документации;</li><li>проектной документации;</li><li>регламентов;</li><li>тендерных материалов;</li><li>претензионной переписки;</li><li>кадровых и корпоративных документов;</li><li>технических заданий;</li><li>финансовых и управленческих отчётов.</li></ul>\n<p>Он может помогать:</p>\n<ul><li>находить нужные документы;</li><li>выделять релевантные положения;</li><li>сравнивать версии;</li><li>группировать информацию;</li><li>составлять сводки;</li><li>обнаруживать расхождения;</li><li>отвечать на вопросы по содержимому папки или базы документов.</li></ul>", "<h1>Примеры задач</h1>\n<h2>Анализ договора</h2>\n<p>Syntolk Assistant может выделить:</p>\n<ul><li>предмет договора;</li><li>обязанности сторон;</li><li>сроки;</li><li>стоимость;</li><li>порядок оплаты;</li><li>ответственность;</li><li>основания расторжения;</li><li>ограничения;</li><li>исключения;</li><li>порядок урегулирования споров.</li></ul>\n<h2>Сравнение документов</h2>\n<p>Система может сопоставить:</p>\n<ul><li>две версии договора;</li><li>разные редакции регламента;</li><li>предложения нескольких поставщиков;</li><li>документы разных подразделений;</li><li>условия до и после внесения изменений.</li></ul>\n<h2>Работа с нормативными материалами</h2>\n<p>При наличии соответствующих документов Syntolk Assistant может:</p>\n<ul><li>найти нужную статью или пункт;</li><li>сопоставить связанные положения;</li><li>выделить условия применения;</li><li>указать исключения;</li><li>подготовить структурированное объяснение на основе текста источника.</li></ul>\n<h2>Подготовка делового ответа</h2>\n<p>Система может создать:</p>\n<ul><li>служебную записку;</li><li>аналитическую справку;</li><li>краткое резюме документа;</li><li>таблицу различий;</li><li>перечень рисков, прямо указанных в материалах;</li><li>проект ответа контрагенту;</li><li>структурированную презентацию;</li><li>выводы для руководителя.</li></ul>", "<h1>Главное преимущество</h1>\n<p>Главное преимущество Syntolk Assistant — сочетание трёх возможностей:</p>\n<h3>1. Понимание контекста</h3>\n<p>Система анализирует не отдельное слово или фразу, а связь между положениями, разделами, документами, датами и условиями.</p>\n<h3>2. Доказательность</h3>\n<p>Существенные утверждения связываются с конкретными источниками, чтобы пользователь мог проверить результат.</p>\n<h3>3. Адаптация под отрасль</h3>\n<p>Если предоставить материалы нужной сферы, Syntolk Assistant может работать с ними в профессиональном формате: использовать терминологию, учитывать структуру документов и отвечать в соответствии с содержанием конкретной предметной области.</p>\n<hr>\n<h1>Syntolk Assistant — это не просто генератор текста</h1>\n<p>Это инструмент, который помогает превратить массив документов в понятные и проверяемые ответы.</p>\n<p>Он не просто сообщает:</p>\n<blockquote><em>«Вот ответ».</em></blockquote>\n<p>Он стремится показать:</p>\n<ul><li>почему сделан именно такой вывод;</li><li>на какой документ он опирается;</li><li>какая формулировка подтверждает результат;</li><li>какие условия нужно учитывать;</li><li>где есть исключения;</li><li>где информации недостаточно;</li><li>где документы противоречат друг другу.</li></ul>\n<h2>Итог</h2>\n<p><strong>Syntolk Assistant — это интеллектуальный помощник для профессиональной работы с информацией.</strong></p>\n<p>Он подходит для любой отрасли, если ему предоставить материалы этой отрасли, и позволяет:</p>\n<ul><li>глубже анализировать документы;</li><li>быстрее находить нужную информацию;</li><li>получать структурированные ответы;</li><li>видеть источники и подтверждения;</li><li>учитывать ограничения и исключения;</li><li>выявлять противоречия;</li><li>снижать риск неподтверждённых выводов;</li><li>превращать сложные массивы данных в понятный результат.</li></ul>\n<blockquote><strong><em>Не просто отвечает.</em></strong><br><strong><em>Проверяет, сопоставляет, объясняет и показывает основания для каждого вывода.</em></strong></blockquote>"];
const TITLES = ["Syntolk Assistant", "Экспертный подход в любой отрасли", "Почему это больше, чем обычный AI", "Работа с источниками", "Сложный многоэтапный анализ", "Точность без выдумок", "Работа с противоречиями", "Работа с большими массивами документов", "Примеры задач", "Главное преимущество"];
const FINAL_SCREENS = [
  `<h1>Syntolk Assistant</h1>
  <h2>Ответы по документам, которые можно проверить</h2>
  <p>Syntolk Assistant помогает находить сведения, сравнивать условия и готовить структурированные ответы по документам и корпоративной информации.</p>
  <p>Вместе с результатом он показывает, на какие материалы опирается. Если данных недостаточно или источники расходятся, это отмечается отдельно.</p>
  <blockquote><strong>Нашёл. Сопоставил. Показал основание.</strong></blockquote>`,

  `<h1>Работает в контексте вашей компании</h1>
  <p>Система адаптируется к предметной области через предоставленные материалы и внутреннюю терминологию.</p>
  <ul>
    <li>договоры, положения и регламенты;</li>
    <li>финансовые и управленческие документы;</li>
    <li>закупочные и коммерческие материалы;</li>
    <li>техническая и проектная документация;</li>
    <li>инструкции и корпоративные базы знаний.</li>
  </ul>
  <p>Так Syntolk учитывает контекст конкретной организации и задачи, не подменяя документы общими предположениями.</p>`,

  `<h1>Как формируется ответ</h1>
  <ol>
    <li><strong>Определяет задачу:</strong> какие сведения, документы, даты или версии нужны.</li>
    <li><strong>Находит материалы:</strong> выбирает относящиеся к вопросу фрагменты.</li>
    <li><strong>Проверяет контекст:</strong> сопоставляет условия, суммы, сроки и исключения.</li>
    <li><strong>Готовит результат:</strong> структурирует вывод и добавляет доступные указатели на источники.</li>
  </ol>
  <p>Если найденный пункт связан с другим разделом, анализ продолжается по документу, чтобы сохранить смысл исходной формулировки.</p>`,

  `<h1>Источники рядом с выводом</h1>
  <p>Существенные утверждения в ответе могут сопровождаться данными, по которым их удобно проверить:</p>
  <ul>
    <li>названием документа или файла;</li>
    <li>нужным разделом и подтверждающим фрагментом;</li>
    <li>датой или версией документа;</li>
    <li>ссылкой или указателем на источник.</li>
  </ul>
  <p>Пользователь видит не только готовый ответ, но и материал, на котором он основан.</p>`,

  `<h1>Точный смысл без домыслов</h1>
  <p>Syntolk учитывает степень обязательности формулировок: «может» не превращается в «обязан», «рекомендуется» — в «необходимо», а «до 30 дней» — в точный срок 30 дней.</p>
  <p>Если документы подтверждают только часть ответа, система отделяет подтверждённые сведения от того, чего в материалах нет.</p>
  <blockquote>В предоставленных документах недостаточно информации, чтобы точно ответить на этот вопрос.</blockquote>
  <p>Так пользователь понимает и результат, и границы доступной информации.</p>`,

  `<h1>Противоречия остаются видимыми</h1>
  <p>Если документы содержат разные сведения, Syntolk не объединяет их в один усреднённый ответ.</p>
  <p>Он может отдельно показать:</p>
  <ul>
    <li>что указано в каждом источнике;</li>
    <li>к каким датам и версиям относятся формулировки;</li>
    <li>какие условия сопровождают каждую позицию;</li>
    <li>какой информации не хватает для окончательного вывода.</li>
  </ul>
  <p>Решение остаётся за пользователем, а основания для него — перед глазами.</p>`,

  `<h1>Что можно поручить Syntolk</h1>
  <ul>
    <li>найти сроки, суммы, обязательства и ограничения;</li>
    <li>сравнить версии договора или предложения поставщиков;</li>
    <li>выделить изменения в регламенте;</li>
    <li>собрать сведения по проекту из нескольких документов;</li>
    <li>подготовить резюме, справку или таблицу различий;</li>
    <li>составить перечень расхождений и вопросов для уточнения.</li>
  </ul>
  <p>Формат результата можно адаптировать под руководителя, специалиста или рабочую команду.</p>`,

  `<h1>Больше, чем генерация текста</h1>
  <p>Syntolk Assistant работает с материалами пользователя и помогает получать ответы, которые можно проверить.</p>
  <ul>
    <li><strong>Контекст:</strong> связанные положения, даты и версии.</li>
    <li><strong>Основания:</strong> доступные источники рядом с выводом.</li>
    <li><strong>Точность:</strong> условия и исключения без усиления смысла.</li>
    <li><strong>Прозрачность:</strong> явное сообщение, если данных мало.</li>
  </ul>
  <blockquote><strong>Не просто отвечает. Показывает, на чём основан вывод.</strong></blockquote>`
];

const FINAL_TITLES = [
  "Syntolk Assistant",
  "Контекст вашей компании",
  "Как формируется ответ",
  "Источники и проверка",
  "Точный смысл",
  "Работа с противоречиями",
  "Практические задачи",
  "Больше, чем генерация текста"
];

const content = aboutRoot.querySelector('#assistant-content');
const scrollArea = aboutRoot.querySelector('#assistant-scroll-area');
const screenEl = aboutRoot.querySelector('.screen');
const counter = aboutRoot.querySelector('#assistant-counter');
const sceneTitle = aboutRoot.querySelector('#assistant-scene-title');
const prev = aboutRoot.querySelector('#assistant-prev');
const next = aboutRoot.querySelector('#assistant-next');
const dots = aboutRoot.querySelector('#assistant-dots');
const play = aboutRoot.querySelector('#assistant-play');
const progressBar = aboutRoot.querySelector('#assistant-progress');
let index = 0;
const AUTO_INTERVAL = 9000;
let autoplay = true;
let hoverPaused = false;
let touchPaused = false;
let timer = null;
let raf = null;
let startedAt = 0;
let duration = 0;
let revealTimers = [];
let touchStartX = null;
  let storyVisible = !('IntersectionObserver' in window);

FINAL_SCREENS.forEach((_, i) => {
  const b = document.createElement('button');
  b.className = 'dot';
  b.setAttribute('aria-label', `Экран ${i+1}`);
  b.addEventListener('click', () => go(i, true));
  dots.appendChild(b);
});

function readingDuration() {
  return AUTO_INTERVAL;
}

function clearTimers() {
  clearTimeout(timer); timer = null;
  cancelAnimationFrame(raf); raf = null;
  revealTimers.forEach(clearTimeout); revealTimers = [];
}

function markRevealables() {
  const firstHeading = content.querySelector('h1,h2,h3');
  if (firstHeading) firstHeading.classList.add('screen-heading');

  content.classList.remove('page-enter','page-enter-active');
  content.classList.add('page-enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => content.classList.add('page-enter-active'));
  });
  const t = setTimeout(() => {
    content.classList.remove('page-enter','page-enter-active');
  }, 700);
  revealTimers.push(t);
}

function updateProgress() {
  if (!autoplay) { progressBar.style.width = '0%'; return; }
  const elapsed = performance.now() - startedAt;
  const pct = Math.min(100, (elapsed / duration) * 100);
  progressBar.style.width = pct + '%';
  if (pct < 100) raf = requestAnimationFrame(updateProgress);
}

function scheduleAuto() {
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  timer = null;
  raf = null;

  // Any hover/touch interaction pauses the slideshow without changing
  // the user's Auto/Pause preference. Leaving the screen starts a fresh 6 s.
  if (!autoplay || hoverPaused || touchPaused || !storyVisible) {
    progressBar.style.width = '0%';
    return;
  }

  duration = readingDuration();
  startedAt = performance.now();
  progressBar.style.width = '0%';
  raf = requestAnimationFrame(updateProgress);

  // Keep the presentation running as a carousel: after the last screen,
  // return to the first one without changing the Auto/Pause preference.
  timer = setTimeout(() => go((index + 1) % FINAL_SCREENS.length, false), duration);
}

function render() {
  clearTimers();
  content.classList.add('is-changing');
  setTimeout(() => {
    content.innerHTML = FINAL_SCREENS[index];
    scrollArea.scrollTo({top:0,behavior:'instant'});
    counter.textContent = `${index + 1} / ${FINAL_SCREENS.length}`;
    sceneTitle.textContent = FINAL_TITLES[index];
    prev.disabled = false;
    next.disabled = false;
    [...dots.children].forEach((d,i)=>d.classList.toggle('active',i===index));
    content.classList.remove('is-changing');
    markRevealables();
    scheduleAuto();
  }, 220);
}

function go(i, manual=false) {
  const target = ((i % FINAL_SCREENS.length) + FINAL_SCREENS.length) % FINAL_SCREENS.length;
  if (target === index) return;
  index = target;
  // Manual navigation no longer disables Auto. If the pointer is over the
  // screen, hover pause keeps the current page still until the pointer leaves.
  render();
}

function syncPlay() {
  play.classList.toggle('paused', autoplay);
  play.setAttribute('aria-label', autoplay ? 'Пауза автоматического показа' : 'Включить автоматический показ');
  aboutRoot.querySelector('#assistant-play-text').textContent = autoplay ? 'Авто' : 'Пауза';
}

prev.addEventListener('click',()=>go(index-1,true));
next.addEventListener('click',()=>go(index+1,true));
play.addEventListener('click',()=>{autoplay=!autoplay;syncPlay();scheduleAuto();});

aboutRoot.addEventListener('keydown', e=>{
  if (e.key==='ArrowRight') go(index+1,true);
  if (e.key==='ArrowLeft') go(index-1,true);
  if (e.code==='Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)) {e.preventDefault();autoplay=!autoplay;syncPlay();scheduleAuto();}
});

// Desktop: merely moving the pointer onto the laptop screen pauses Auto.
// No click is required. Leaving the screen always starts a NEW full 6-second timer.
screenEl.addEventListener('mouseenter', () => {
  hoverPaused = true;
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  timer = null;
  raf = null;
  progressBar.style.width = '0%';
});

screenEl.addEventListener('mouseleave', () => {
  hoverPaused = false;
  scheduleAuto();
});

// Wheel scrolling is free while the pointer is over the screen; hover already
// keeps the slideshow paused, so scrolling never permanently disables Auto.
scrollArea.addEventListener('wheel', () => {}, {passive:true});

// Touch devices have no hover. A touch temporarily pauses the slideshow;
// after the finger is lifted, a fresh 6-second timer starts.
scrollArea.addEventListener('touchstart',e=>{
  touchPaused = true;
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  timer = null;
  raf = null;
  progressBar.style.width = '0%';
  touchStartX=e.changedTouches[0].clientX;
},{passive:true});

scrollArea.addEventListener('touchend',e=>{
  if (touchStartX!==null) {
    const dx=e.changedTouches[0].clientX-touchStartX;
    if (Math.abs(dx)>55) go(index + (dx<0?1:-1), true);
  }
  touchStartX=null;
  touchPaused = false;
  scheduleAuto();
},{passive:true});

scrollArea.addEventListener('touchcancel',()=>{
  touchStartX=null;
  touchPaused = false;
  scheduleAuto();
},{passive:true});


if ('IntersectionObserver' in window) {
  const storyObserver = new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
    if (visible === storyVisible) return;
    storyVisible = visible;
    if (visible) {
      scheduleAuto();
    } else {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      timer = null;
      raf = null;
      progressBar.style.width = '0%';
    }
  }, {threshold:[0,0.2]});
  storyObserver.observe(aboutRoot);
}

syncPlay();
render();

})();

/* Interactive controls from the supplied account demo, scoped to this section. */

(() => {
  const root = document.getElementById('additional-features');
  if (!root) return;
  const formatInt = value => new Intl.NumberFormat('ru-RU').format(value);
  const formatDecimal = value => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  };

  root.querySelectorAll('.af-addon-counter').forEach(card => {
    const qtyEl = card.querySelector('.af-qty');
    const valueEl = card.querySelector('.af-addon-value');
    const minus = card.querySelector('.af-minus');
    const plus = card.querySelector('.af-plus');
    const unit = Number(card.dataset.unit);
    const kind = card.dataset.kind;
    let qty = 1;

    const render = () => {
      qtyEl.textContent = qty;
      if (kind === 'storage') valueEl.textContent = `+${formatInt(unit * qty)} МБ`;
      if (kind === 'indexed') valueEl.textContent = `+${formatDecimal(unit * qty)} ГБ`;
      if (kind === 'fragments') valueEl.textContent = `+${formatInt(unit * qty)} фрагментов`;
      minus.disabled = qty <= 1;
      minus.style.opacity = qty <= 1 ? '.65' : '1';
      minus.style.cursor = qty <= 1 ? 'default' : 'pointer';
    };

    minus.addEventListener('click', () => { if (qty > 1) { qty--; render(); } });
    plus.addEventListener('click', () => { if (qty < 99) { qty++; render(); } });
    render();
  });

  const llm = root.querySelector('.af-llm-addon');
  if (llm) {
    const slider = llm.querySelector('.af-range-input');
    const current = llm.querySelector('.af-range-current');
    const value = llm.querySelector('.af-llm-value');
    const pills = [...llm.querySelectorAll('.af-price-pills button')];

    const renderLLM = amount => {
      const formatted = `${formatInt(amount)} ₽`;
      current.textContent = formatted;
      if (value) value.textContent = formatted;
      pills.forEach(btn => btn.classList.toggle('af-active', Number(btn.dataset.value) === amount));
    };

    pills.forEach(btn => btn.addEventListener('click', () => {
      const amount = Number(btn.dataset.value);
      slider.value = amount;
      renderLLM(amount);
    }));

    slider.addEventListener('input', () => renderLLM(Number(slider.value)));
    renderLLM(Number(slider.value));
  }

  // Interactive folder permissions demo for section 03.
  const permissionDialog = root.querySelector('.af-permission-dialog');
  if (permissionDialog) {
    const folderTriggers = [...root.querySelectorAll('.af-folder-row')];
    const folderLabel = permissionDialog.querySelector('.af-dialog-folder');
    const permissionButtons = [...permissionDialog.querySelectorAll('.af-permission-toggle')];
    const status = permissionDialog.querySelector('.af-dialog-status');
    const closeButton = permissionDialog.querySelector('.af-permission-close');
    const closeBackdrop = permissionDialog.querySelector('.af-permission-backdrop');
    const savedRights = new Map();
    let activeFolder = 'файлы';
    let selectedRights = new Set(['Чтение', 'Загрузка', 'Удаление']);
    let lastTrigger = null;
    let previousOverflow = '';

    const renderRights = () => {
      permissionButtons.forEach(button => {
        const enabled = selectedRights.has(button.dataset.permission);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        button.querySelector('.af-switch')?.classList.toggle('af-on', enabled);
      });
    };

    const openPermissionDialog = (folder, trigger) => {
      activeFolder = folder || 'файлы';
      lastTrigger = trigger || null;
      folderLabel.textContent = activeFolder;
      selectedRights = new Set(savedRights.get(activeFolder) || ['Чтение', 'Загрузка', 'Удаление']);
      status.textContent = 'Нет назначенных прав доступа. Добавьте права доступа для пользователей.';
      renderRights();
      permissionDialog.hidden = false;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeButton?.focus();
    };

    const closePermissionDialog = () => {
      permissionDialog.hidden = true;
      document.body.style.overflow = previousOverflow;
      lastTrigger?.focus();
    };

    folderTriggers.forEach(trigger => {
      const folder = trigger.dataset.folder || 'файлы';
      trigger.addEventListener('click', () => openPermissionDialog(folder, trigger));
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPermissionDialog(folder, trigger);
        }
      });
    });

    permissionButtons.forEach(button => button.addEventListener('click', () => {
      const permission = button.dataset.permission;
      if (selectedRights.has(permission)) selectedRights.delete(permission);
      else selectedRights.add(permission);
      renderRights();
    }));

    closeButton?.addEventListener('click', closePermissionDialog);
    closeBackdrop?.addEventListener('click', closePermissionDialog);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !permissionDialog.hidden) closePermissionDialog();
    });
  }

  root.querySelector('.af-invite-register')?.addEventListener('click', () => {
    window.location.href = 'https://platform.syntolk.ru/register';
  });
})();
