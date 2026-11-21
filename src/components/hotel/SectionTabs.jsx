import { useEffect, useState } from 'react';

/** The section menu that stays at the top while scrolling and shows where you are. */
const SectionTabs = ({ sections }) => {
  const [active, setActive] = useState(sections[0]?.[0]);
  useEffect(() => {
    const els = sections.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    // Sections in the band just below the menu; the first of them (in page order) is current
    const inBand = new Set();
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inBand.add(e.target.id) : inBand.delete(e.target.id)));
      const first = sections.find(([id]) => inBand.has(id));
      if (first) setActive(first[0]);
    }, { rootMargin: '-130px 0px -60% 0px' });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);
  return (
    <nav aria-label="Hotel sections" className="sticky top-16 z-30 bg-gray-50/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto text-sm font-semibold">
        {sections.map(([sid, label]) => (
          <a key={sid} href={`#${sid}`} onClick={() => setActive(sid)} aria-current={active === sid ? 'true' : undefined}
            className={`py-3 border-b-2 whitespace-nowrap transition-colors ${active === sid ? 'border-brand-600 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
};

export default SectionTabs;
