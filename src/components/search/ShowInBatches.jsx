import { useEffect, useRef, useState } from 'react';

/**
 * Shows a long list a batch at a time: the first `batch` items, then the next batch when the
 * guest scrolls near the end (or presses "Show more"). A city can have hundreds of hotels;
 * drawing them all at once makes phones slow. Starts again from the top when `resetKey` changes
 * (new search or filters).
 */
const ShowInBatches = ({ items, batch = 20, resetKey, render, label = 'hotels' }) => {
  const [count, setCount] = useState(batch);
  const end = useRef(null);

  useEffect(() => { setCount(batch); }, [resetKey, batch]);

  const more = count < items.length;
  useEffect(() => {
    if (!more || !end.current || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => c + batch);
    }, { rootMargin: '800px 0px' });
    io.observe(end.current);
    return () => io.disconnect();
  }, [more, batch, count]);

  return (
    <>
      {items.slice(0, count).map(render)}
      {more && (
        <div ref={end} className="pt-2 text-center">
          <button type="button" onClick={() => setCount((c) => c + batch)}
            className="px-5 py-2.5 rounded-lg border-2 border-navy-700 text-navy-800 font-semibold hover:bg-navy-50">
            Show more {label} ({items.length - count} more)
          </button>
        </div>
      )}
    </>
  );
};

export default ShowInBatches;
