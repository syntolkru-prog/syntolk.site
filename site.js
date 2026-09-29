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

  let centers = [], relativeCenters = [], period = 0, origin = 0, world = 0;
  let selected = 0, variant = 0, mode = 'idle', timer = 0, frame = 0;
  let heroVisible = true, pointer = null, suppressClickUntil = 0;
  let litTab = null, questionAnimation = null, measuredWidth = 0;
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
    const center = local + rail.clientWidth / 2;
    let nearest = visualTabs[0], distance = Infinity;
    visualTabs.forEach((tab, index) => {
      const gap = Math.abs(centers[index] - center);
      if (gap < distance) { distance = gap; nearest = tab; }
    });
    if (nearest !== litTab) {
      litTab?.classList.remove('is-active');
      nearest.classList.add('is-active');
      litTab = nearest;
    }
  }
  function stopTimer() {
    clearTimeout(timer);
    timer = 0;
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
    questionAnimation?.cancel();
    questionAnimation = null;
    questionText.classList.add('is-moving');
  }
  function paintQuestion() {
    const finishingMotion = questionText.classList.contains('is-moving');
    const entry = scenarios[logicalIndex(selected)];
    tabs.forEach((tab, index) => tab.setAttribute('aria-selected', String(index === logicalIndex(selected))));
    rail.setAttribute('aria-activedescendant', tabs[logicalIndex(selected)].id);
    panel.setAttribute('aria-labelledby', tabs[logicalIndex(selected)].id);
    question.textContent = entry.questions[variant];
    secondary.hidden = true;
    $('#question-accessibility').textContent = entry.questions[variant];
    questionAnimation?.cancel();
    questionAnimation = null;
    if (finishingMotion) questionText.classList.remove('is-moving');
    else if (!reduced.matches) questionAnimation = question.animate(
      [{opacity: 0}, {opacity: 1}], {duration: 350, easing: 'ease-out'}
    );
  }
  function schedule() {
    stopTimer();
    if (mode !== 'idle' || !canRun()) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!canRun() || mode !== 'idle') return;
      if (variant === 0) {
        variant = 1;
        paintQuestion();
        schedule();
      } else {
        advanceClockwise();
      }
    }, 3500);
  }
  function commit(virtual) {
    selected = virtual;
    variant = 0;
    mode = 'idle';
    world = targetFor(virtual);
    draw();
    paintQuestion();
    schedule();
  }
  function animateTo(target, duration, done) {
    stopMotion();
    if (reduced.matches || duration <= 0 || Math.abs(target - world) < 1) {
      world = target;
      draw();
      done();
      return;
    }
    const start = world;
    let began;
    const tick = now => {
      if (began === undefined) began = now;
      const progress = Math.min(1, (now - began) / duration);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      world = start + (target - start) * eased;
      draw();
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { frame = 0; world = target; draw(); done(); }
    };
    frame = requestAnimationFrame(tick);
  }
  function advanceClockwise() {
    stopTimer();
    mode = 'auto-moving';
    hideQuestionForMotion();
    const next = selected + 1;
    animateTo(targetFor(next), 1400, () => commit(next));
  }
  function choose(virtual) {
    stopTimer();
    stopMotion();
    mode = 'selecting';
    hideQuestionForMotion();
    const target = targetFor(virtual);
    const duration = Math.max(450, Math.min(1800, Math.abs(target - world) * 4));
    animateTo(target, duration, () => commit(virtual));
  }
  function settle() {
    mode = 'settling';
    hideQuestionForMotion();
    const nearest = nearestVirtual(world);
    const target = targetFor(nearest);
    const duration = Math.max(260, Math.min(480, Math.abs(target - world) * 2));
    animateTo(target, duration, () => commit(nearest));
  }
  function startInertia(speed) {
    if (reduced.matches || Math.abs(speed) < .08) { settle(); return; }
    mode = 'inertia';
    let velocity = Math.max(-2.4, Math.min(2.4, speed));
    let last = performance.now(), elapsed = 0;
    const coast = now => {
      const dt = Math.min(50, Math.max(1, now - last));
      last = now;
      elapsed += dt;
      world += velocity * dt;
      velocity *= Math.pow(.966, dt / 16);
      draw();
      if (Math.abs(velocity) > .035 && elapsed < 2800) frame = requestAnimationFrame(coast);
      else { frame = 0; settle(); }
    };
    frame = requestAnimationFrame(coast);
  }
  function pauseCarousel() {
    stopTimer();
    if (mode === 'idle') return;
    stopMotion();
    pointer = null;
    rail.classList.remove('is-dragging');
    commit(nearestVirtual(world));
  }
  function measure() {
    const interruptedMotion = questionText.classList.contains('is-moving');
    stopTimer();
    stopMotion();
    mode = 'idle';
    centers = visualTabs.map(tab => tab.offsetLeft + tab.offsetWidth / 2);
    period = centers[sectorCount * 3] - centers[sectorCount * 2];
    relativeCenters = tabs.map((_, index) => centers[sectorCount * 2 + index] - centers[sectorCount * 2]);
    origin = centers[sectorCount * 2] - rail.clientWidth / 2;
    world = targetFor(selected);
    draw();
    if (interruptedMotion) paintQuestion();
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
    if (reduced.matches && mode !== 'idle') pauseCarousel();
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
  document.fonts.ready.then(() => { measure(); reserveQuestionSpace(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => {
    measure();
    if (questionText.clientWidth !== measuredWidth) reserveQuestionSpace();
  }).observe(rail);
  window.addEventListener('resize', reserveQuestionSpace);

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
    clearTimeout(timer);
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
