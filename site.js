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

})();

(() => {
  const mobile = matchMedia('(max-width:760px)');
  const details = [...document.querySelectorAll('#pricing .plan-details')];
  const sync = () => {
    details.forEach(item => {item.open = !mobile.matches;});
    if (mobile.matches) {
      document.querySelectorAll('#pricing [data-pricing-panel="personal"] .plan').forEach(item => {
        item.classList.toggle('pop', item.hasAttribute('data-recommended'));
      });
    }
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
  const headerNav = $('.site-header .nav');
  const syncHeaderHeight = () => mobileNav.style.setProperty('--syntolk-header-height', Math.ceil(headerNav.getBoundingClientRect().height) + 'px');
  new ResizeObserver(syncHeaderHeight).observe(headerNav);
  syncHeaderHeight();

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


(()=>{
      const root=document.querySelector('#syntolk-about .assistant-showcase');
      if(!root)return;
      const pages=[...root.querySelectorAll('.as-page')];
      const body=root.querySelector('#as-screen-body');
      const screen=root.querySelector('.as-screen');
      const dots=root.querySelector('.as-dots');
      const count=root.querySelector('#as-count');
      const auto=root.querySelector('#as-auto');
      let current=0,playing=false,timer=null,inView=false;
      let hovering=window.matchMedia('(hover: hover) and (pointer: fine)').matches&&screen.matches(':hover');
      const dotButtons=pages.map((page,i)=>{
        const button=document.createElement('button');
        button.className='as-dot';button.setAttribute('aria-label',`${i+1}. ${page.dataset.title}`);
        button.setAttribute('aria-current',i===0?'true':'false');button.innerHTML='<span></span>';
        button.addEventListener('click',()=>show(i));dots.append(button);return button;
      });
      function schedule(){
        clearTimeout(timer);timer=null;
        if(playing&&inView&&!hovering&&!document.hidden)timer=setTimeout(()=>show(current+1),25000);
      }
      function setPlaying(value){playing=value;auto.setAttribute('aria-pressed',String(value));auto.setAttribute('aria-label',value?'Остановить автоматическое переключение':'Включить автоматическое переключение каждые 25 секунд');auto.querySelector('use').setAttribute('href',value?'#as-pause':'#as-play');schedule();}
      function show(index){
        current=(index+pages.length)%pages.length;
        pages.forEach((page,i)=>{page.hidden=i!==current;});
        dotButtons.forEach((button,i)=>button.setAttribute('aria-current',i===current?'true':'false'));
        body.scrollTo({top:0,behavior:'instant'});count.textContent=`${current+1} / ${pages.length}`;
        schedule();
      }
      root.querySelector('#as-prev').addEventListener('click',()=>show(current-1));
      root.querySelector('#as-next').addEventListener('click',()=>show(current+1));
      auto.addEventListener('click',()=>setPlaying(!playing));
      document.addEventListener('visibilitychange',schedule);
      function setHover(value,event){
        if(event.pointerType==='touch')return;
        hovering=value;schedule();
      }
      screen.addEventListener('pointerenter',event=>setHover(true,event));
      screen.addEventListener('pointerleave',event=>setHover(false,event));
      // Reading and manual navigation restart the 25-second interval without disabling Auto.
      body.addEventListener('wheel',schedule,{passive:true});
      body.addEventListener('pointerdown',schedule,{passive:true});
      body.addEventListener('scroll',schedule,{passive:true});
      screen.addEventListener('keydown',event=>{
        if(event.target.closest('[role=tablist]'))return;
        if(event.key==='ArrowRight'){event.preventDefault();show(current+1);}
        if(event.key==='ArrowLeft'){event.preventDefault();show(current-1);}
      });
      let touchStart=null;
      body.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});
      body.addEventListener('touchstart',event=>{const t=event.touches[0];touchStart={x:t.clientX,y:t.clientY,target:event.target};},{passive:true});
      body.addEventListener('touchend',event=>{
        if(!touchStart||touchStart.target.closest('button,a')){touchStart=null;return;}
        const t=event.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;
        if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.8)show(current+(dx<0?1:-1));
        touchStart=null;
      },{passive:true});
      if('IntersectionObserver' in window){
        new IntersectionObserver(entries=>{
          const visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.1;
          if(visible!==inView){inView=visible;schedule();}
        },{threshold:.1}).observe(screen);
      }else inView=true;
      const start=Number(new URLSearchParams(location.search).get('assistant-screen'));
      show(Number.isInteger(start)&&start>=1&&start<=pages.length?start-1:0);
      setPlaying(true);
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
    let inertBackground = [];

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
      inertBackground = [];
      for (let branch = permissionDialog; branch && branch !== document.body; branch = branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling === branch) continue;
          inertBackground.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeButton?.focus();
    };

    const closePermissionDialog = () => {
      permissionDialog.hidden = true;
      inertBackground.forEach(([element, wasInert]) => { element.inert = wasInert; });
      inertBackground = [];
      document.body.style.overflow = previousOverflow;
      lastTrigger?.focus({preventScroll:true});
    };

    folderTriggers.forEach(trigger => {
      const folder = trigger.dataset.folder || 'Клиенты';
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
      if (permissionDialog.hidden) return;
      if (event.key === 'Escape') closePermissionDialog();
      if (event.key === 'Tab') {
        const controls = [...permissionDialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
        if (!controls.length) return;
        event.preventDefault();
        const current = controls.indexOf(document.activeElement);
        const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus();
      }
    });
  }

  root.querySelector('.af-invite-register')?.addEventListener('click', () => {
    window.location.href = 'https://platform.syntolk.ru/register';
  });
})();
