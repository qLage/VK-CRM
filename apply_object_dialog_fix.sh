#!/bin/sh
set -e

cd /root/CRM/dist

cat > object-dialog-fix.js <<'EOF'
(function () {
  const labelToId = {
    'категория': 'category',
    'локация': 'location',
    'параметры': 'params',
    'детали': 'details',
    'аренда': 'rent',
    'описание': 'description',
    'фото': 'photos',
    'клиент': 'client'
  };
  const navClass = {
    activeAdd: ['bg-primary/15', 'text-primary', 'border', 'border-primary/20'],
    activeRemove: ['text-white/50', 'hover:text-white/80', 'hover:bg-white/5', 'border-transparent']
  };

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isObjectDialog(dialog) {
    const txt = normalize(dialog.textContent);
    return txt.includes('новый объект') || txt.includes('редактирование объекта');
  }

  function getDialog() {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const d of dialogs) {
      if (isObjectDialog(d)) return d;
    }
    return null;
  }

  function applyWide(dialog) {
    if (!dialog) return;
    dialog.style.setProperty('--dialog-content-max-width', '1500px');
    dialog.style.maxWidth = '1500px';
    dialog.style.width = 'calc(100vw - 1.5rem)';
  }

  function getSidebarButtons(dialog) {
    return Array.from(dialog.querySelectorAll('button')).filter((btn) => {
      const label = normalize(btn.textContent);
      return !!labelToId[label];
    });
  }

  function getSectionElement(dialog, id) {
    return dialog.querySelector('#section-' + id);
  }

  function getScrollContainer(dialog) {
    const form = dialog.querySelector('form');
    if (!form) return null;
    let el = form.parentElement;
    while (el && el !== dialog) {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return form.parentElement;
  }

  function setActiveButton(dialog, sectionId) {
    const buttons = getSidebarButtons(dialog);
    buttons.forEach((btn) => {
      const id = labelToId[normalize(btn.textContent)];
      const active = id === sectionId;
      if (active) {
        navClass.activeAdd.forEach((c) => btn.classList.add(c));
        navClass.activeRemove.forEach((c) => btn.classList.remove(c));
      } else {
        navClass.activeAdd.forEach((c) => btn.classList.remove(c));
      }
    });
  }

  function getCurrentSectionId(dialog) {
    const scroller = getScrollContainer(dialog);
    if (!scroller) return null;
    const ids = Object.values(labelToId);
    const anchorY = scroller.getBoundingClientRect().top + 120;
    let current = null;
    for (const id of ids) {
      const section = getSectionElement(dialog, id);
      if (!section) continue;
      const top = section.getBoundingClientRect().top;
      if (top <= anchorY) current = id;
    }
    return current || ids[0];
  }

  function jumpToSection(dialog, sectionId) {
    const section = getSectionElement(dialog, sectionId);
    const scroller = getScrollContainer(dialog);
    if (!section || !scroller) return;
    const scrollerTop = scroller.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    const targetTop = scroller.scrollTop + (sectionTop - scrollerTop) - 8;
    scroller.scrollTo({ top: targetTop, behavior: 'auto' });
    setActiveButton(dialog, sectionId);
  }

  function bindDialog(dialog) {
    if (!dialog || dialog.dataset.objectDialogNavFixBound === '1') return;
    dialog.dataset.objectDialogNavFixBound = '1';
    applyWide(dialog);

    const scroller = getScrollContainer(dialog);
    if (scroller) {
      let raf = 0;
      const onScroll = function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          const current = getCurrentSectionId(dialog);
          if (current) setActiveButton(dialog, current);
        });
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  document.addEventListener('click', function (event) {
    const btn = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!btn) return;
    const dialog = btn.closest('[role="dialog"]');
    if (!dialog || !isObjectDialog(dialog)) return;
    const sectionId = labelToId[normalize(btn.textContent)];
    bindDialog(dialog);
    if (!sectionId) return;
    event.preventDefault();
    event.stopPropagation();
    jumpToSection(dialog, sectionId);
  }, true);

  let bootstrapRuns = 0;
  const timer = setInterval(function () {
    bootstrapRuns += 1;
    const dialog = getDialog();
    if (dialog) {
      bindDialog(dialog);
      const current = getCurrentSectionId(dialog);
      if (current) setActiveButton(dialog, current);
    }
    if (bootstrapRuns >= 50) clearInterval(timer);
  }, 120);
})();
EOF

v=$(date +%s)
sed -i '/object-dialog-fix\.js/d' index.html
sed -i "s@</body>@  <script src=\"/object-dialog-fix.js?v=${v}\"></script>\n  </body>@" index.html
echo "object-dialog-fix version=${v}"
sed -n '18,32p' index.html
